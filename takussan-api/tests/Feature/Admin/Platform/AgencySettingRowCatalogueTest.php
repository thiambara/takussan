<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use App\Models\User;
use App\Services\Invoice\OverdueReminderService;
use App\Services\Lease\EarlyTerminationService;
use App\Services\Lease\LateFeeCalculator;
use App\Services\Lease\RentReviewService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionMethod;
use Tests\TestCase;

/**
 * TCK-964 (P47.04) — une ligne d'agence de `POST /api/settings` obéit au catalogue.
 *
 * Les bornes du catalogue (ADR-0065) ne valaient que pour la ligne globale. La ligne d'agence, qui
 * l'emporte (`ScopedSetting`), passait sans règle : une hausse de loyer plafonnée à 500 %, une
 * indemnité de résiliation de 99 mois, rendues telles quelles par les lecteurs.
 */
class AgencySettingRowCatalogueTest extends TestCase
{
    use RefreshDatabase;

    private function adminDAgence(): Agency
    {
        $agence = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agence);
        Sanctum::actingAs($admin);

        return $agence;
    }

    /** @return array<string, array{string, array<mixed>}> */
    public static function horsBornes(): array
    {
        return [
            'hausse de loyer à 500 %' => [RentReviewService::SETTING_KEY, ['value' => 500]],
            'plafond des pénalités à 1000 %' => ['late_fees.cap_percent', ['value' => 1000]],
            'indemnité de 99 mois' => [EarlyTerminationService::SETTING_KEY, ['value' => 99]],
            'indemnité de 0 mois' => [EarlyTerminationService::SETTING_KEY, ['value' => 0]],
            'relances non numériques' => [OverdueReminderService::SETTING_KEY, ['value' => 'abc']],
            'relance à 400 jours' => [OverdueReminderService::SETTING_KEY, ['value' => [3, 400]]],
            'signature non booléenne' => ['lease.require_signature', ['value' => 'peut-être']],
        ];
    }

    #[DataProvider('horsBornes')]
    public function test_une_valeur_hors_des_regles_du_catalogue_est_refusee(string $cle, array $valeur): void
    {
        $this->adminDAgence();

        $this->postJson('/api/settings', ['key' => $cle, 'value' => $valeur, 'scope' => SettingScope::Agency->value])
            ->assertStatus(422)
            ->assertJsonValidationErrors('value');

        $this->assertSame(0, Setting::query()->count());
    }

    /** @return array<string, array{string}> */
    public static function horsCatalogue(): array
    {
        return [
            'clé sans lecteur' => ['site_name'],
            'clé du catalogue sans repli par agence' => ['credits.welcome_amount'],
        ];
    }

    #[DataProvider('horsCatalogue')]
    public function test_une_cle_hors_catalogue_est_refusee(string $cle): void
    {
        $this->adminDAgence();

        $this->postJson('/api/settings', ['key' => $cle, 'value' => ['value' => 8], 'scope' => SettingScope::Agency->value])
            ->assertStatus(422)
            ->assertJsonValidationErrors('key');

        $this->assertSame(0, Setting::query()->count());
    }

    public function test_une_valeur_dans_les_bornes_s_ecrit_et_se_lit(): void
    {
        $agence = $this->adminDAgence();

        $this->postJson('/api/settings', ['key' => RentReviewService::SETTING_KEY, 'value' => ['value' => 8], 'scope' => 'agency'])->assertCreated();
        $this->postJson('/api/settings', ['key' => OverdueReminderService::SETTING_KEY, 'value' => ['value' => [40, 41]], 'scope' => 'agency'])->assertCreated();
        $this->postJson('/api/settings', ['key' => 'late_fees.cap_percent', 'value' => ['value' => null], 'scope' => 'agency'])->assertCreated();

        $this->assertSame(8.0, app(RentReviewService::class)->resolveMaxPct($agence->id));
        $this->assertSame([40, 41], app(OverdueReminderService::class)->offsets($agence->id));
    }

    /** L'autorisation prime toujours : un agent ne lit pas le catalogue dans un 422 (CLAUDE.md, « Validation », piège 2). */
    public function test_un_agent_recoit_403_meme_pour_une_cle_hors_catalogue(): void
    {
        $agence = Agency::factory()->create();
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agence);
        Sanctum::actingAs($agent);

        $this->postJson('/api/settings', ['key' => 'site_name', 'value' => ['value' => 1], 'scope' => 'agency'])
            ->assertForbidden();
        $this->postJson('/api/settings', ['key' => 'site_name', 'value' => ['value' => 1], 'scope' => 'global'])
            ->assertForbidden()
            ->assertJsonPath('code', 'setting.global_forbidden');
    }

    public function test_une_ligne_deja_ecrite_hors_borne_se_lit_a_la_borne(): void
    {
        $agence = Agency::factory()->create();
        foreach ([
            RentReviewService::SETTING_KEY => 500,
            EarlyTerminationService::SETTING_KEY => 99,
            'late_fees.cap_percent' => 1000,
        ] as $cle => $valeur) {
            Setting::query()->create(['key' => $cle, 'value' => ['value' => $valeur], 'scope' => SettingScope::Agency, 'scope_id' => $agence->id]);
        }

        $this->assertSame(100.0, app(RentReviewService::class)->resolveMaxPct($agence->id));
        $this->assertSame(24, app(EarlyTerminationService::class)->resolvePenaltyMonths($agence->id));
        $this->assertSame(100.0, (new ReflectionMethod(LateFeeCalculator::class, 'capPercent'))->invoke(app(LateFeeCalculator::class), $agence->id));
    }

    public function test_un_plafond_negatif_deja_ecrit_se_lit_a_zero(): void
    {
        $agence = Agency::factory()->create();
        Setting::query()->create(['key' => 'late_fees.cap_percent', 'value' => ['value' => -5], 'scope' => SettingScope::Agency, 'scope_id' => $agence->id]);

        $this->assertSame(0.0, (new ReflectionMethod(LateFeeCalculator::class, 'capPercent'))->invoke(app(LateFeeCalculator::class), $agence->id));
    }
}
