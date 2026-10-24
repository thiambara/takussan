<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use App\Models\User;
use App\Services\Invoice\OverdueReminderService;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\RentReviewService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-1999 (P181.01, P181.04) — une seule règle pour la ligne d'agence, au `POST` et au `PUT`.
 *
 * Le `PUT /api/settings/{id}` n'avait que `value: required|array` : il enregistrait sur une ligne
 * d'agence ce que le catalogue refuse au `POST` (relance à 100 000 jours). Et les deux écrivaient le
 * tableau `value` entier, clés inconnues comprises : la ligne s'écrit désormais sous la forme
 * canonique `{"value": …}`, la valeur déballée et validée seule.
 */
class ReglageDAgenceAuPutTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agence;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agence);
        Sanctum::actingAs($admin);
    }

    private function ligne(string $cle, array $valeur): Setting
    {
        return Setting::query()->create([
            'key' => $cle,
            'value' => $valeur,
            'scope' => SettingScope::Agency,
            'scope_id' => $this->agence->id,
        ]);
    }

    /** @return array<string, mixed> */
    private function brut(Setting $setting): array
    {
        return json_decode((string) DB::table('settings')->where('id', $setting->id)->value('value'), true);
    }

    /** @return array<string, array{string, array<mixed>, array<mixed>}> */
    public static function horsBornes(): array
    {
        return [
            'relances hors bornes' => [OverdueReminderService::SETTING_KEY, ['value' => [3]], ['value' => ['abc', -5, 100000]]],
            'relance à 1000 jours' => [OverdueReminderService::SETTING_KEY, ['value' => [3]], ['value' => [1000]]],
            'hausse de loyer à 500 %' => [RentReviewService::SETTING_KEY, ['value' => 5], ['value' => 500]],
            'indemnité de 99 mois' => [EarlyTerminationService::SETTING_KEY, ['value' => 2], ['value' => 99]],
            'signature non booléenne' => ['lease.require_signature', ['value' => true], ['value' => 'peut-être']],
        ];
    }

    #[DataProvider('horsBornes')]
    public function test_le_put_refuse_ce_que_le_catalogue_refuse(string $cle, array $avant, array $apres): void
    {
        $setting = $this->ligne($cle, $avant);

        $this->putJson("/api/settings/{$setting->id}", ['value' => $apres])
            ->assertStatus(422)
            ->assertJsonValidationErrors('value');

        $this->assertSame($avant, $this->brut($setting));
    }

    public function test_le_put_refuse_une_ligne_dont_la_cle_est_hors_catalogue(): void
    {
        $setting = $this->ligne('site_name', ['value' => 'x']);

        $this->putJson("/api/settings/{$setting->id}", ['value' => ['value' => 'y']])
            ->assertStatus(422)
            ->assertJsonValidationErrors('key');
    }

    public function test_le_put_ecrit_une_valeur_admise_sous_la_forme_canonique(): void
    {
        $setting = $this->ligne(OverdueReminderService::SETTING_KEY, ['value' => [3]]);

        $this->putJson("/api/settings/{$setting->id}", ['value' => ['value' => [5, 10], 'junk' => ['a', 'b']]])
            ->assertOk();

        $this->assertSame(['value' => [5, 10]], $this->brut($setting));
    }

    public function test_le_post_ecrit_la_forme_canonique_sans_les_cles_inconnues(): void
    {
        $id = $this->postJson('/api/settings', [
            'key' => 'lease.require_signature',
            'value' => ['value' => true, 'junk' => array_fill(0, 50, 'xxxxxxxx')],
            'scope' => SettingScope::Agency->value,
        ])->assertCreated()->json('data.id');

        $this->assertSame(['value' => true], $this->brut(Setting::query()->findOrFail($id)));
    }

    public function test_la_forme_heritee_se_reecrit_sous_la_forme_canonique(): void
    {
        $id = $this->postJson('/api/settings', [
            'key' => EarlyTerminationService::SETTING_KEY,
            'value' => ['months' => 3],
            'scope' => SettingScope::Agency->value,
        ])->assertCreated()->json('data.id');

        $this->assertSame(['value' => 3], $this->brut(Setting::query()->findOrFail($id)));
    }
}
