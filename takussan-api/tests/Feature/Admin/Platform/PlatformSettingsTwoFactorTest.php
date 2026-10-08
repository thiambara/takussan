<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-600 (verif-600 R1, raccord 597) — un réglage GLOBAL règle tout le parc, y compris les clés
 * hors catalogue que lisent les services métier : l'écrire hors de `/api/admin` exige la 2FA
 * plateforme, comme sous la console. `SettingController` n'était dans aucune liste.
 *
 * L'admin d'agence, sur la portée `agency`, n'est pas concerné : `PLATFORM_TWO_FACTOR` ne vise que
 * les profils plateforme.
 */
class PlatformSettingsTwoFactorTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites, RefreshDatabase;

    private const CLE = 'lease.require_signature';

    public static function sansSecondFacteur(): array
    {
        return [
            'super-admin sans 2FA' => [false, 'two_factor_required'],
            'jeton qui n\'a pas vu le second facteur' => [true, 'two_factor_step_up_required'],
        ];
    }

    #[DataProvider('sansSecondFacteur')]
    public function test_la_plateforme_n_ecrit_pas_un_reglage_global_sans_son_second_facteur(bool $a2fa, string $code): void
    {
        $existant = Setting::query()->create([
            'key' => 'invoice.reminder_offsets_days',
            'value' => ['value' => [1, 3, 7]],
            'scope' => SettingScope::Global,
            'scope_id' => null,
        ]);
        $enTetes = $this->superAdmin($a2fa);

        $this->refuse($this->postJson('/api/settings', ['key' => self::CLE, 'scope' => 'global', 'value' => ['value' => true]], $enTetes), $code);
        $this->refuse($this->putJson("/api/settings/{$existant->id}", ['value' => ['value' => [30]]], $enTetes), $code);
        $this->refuse($this->deleteJson("/api/settings/{$existant->id}", [], $enTetes), $code);

        $this->assertFalse(Setting::query()->where('key', self::CLE)->exists());
        $this->assertSame([1, 3, 7], $existant->refresh()->value['value']);
    }

    /** Témoin : sous une session à deux facteurs, le même geste passe. */
    public function test_une_session_a_deux_facteurs_ecrit_le_reglage_global(): void
    {
        $super = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($super, 'super_admin');
        $this->actingAsWithStepUp($super);

        $this->postJson('/api/settings', ['key' => self::CLE, 'scope' => 'global', 'value' => ['value' => true]])
            ->assertCreated();
    }

    /** Second chemin : l'admin d'agence, sans 2FA, règle toujours SA portée. */
    public function test_l_admin_d_agence_regle_sa_portee_sans_la_2fa_plateforme(): void
    {
        $agence = Agency::factory()->create();
        $this->actingAsApi($this->personnel($agence, 'agency_admin'));

        $this->postJson('/api/settings', ['key' => self::CLE, 'scope' => 'agency', 'value' => ['value' => true]])
            ->assertCreated();
        $this->assertTrue(Setting::query()->where('key', self::CLE)->where('scope_id', $agence->id)->exists());
    }

    /** @return array<string, string> */
    private function superAdmin(bool $a2fa): array
    {
        $super = $a2fa ? User::factory()->withTwoFactor()->create() : User::factory()->create();
        $this->materializeRoleProfile($super, 'super_admin');

        if (! $a2fa) {
            $this->actingAsApi($super);

            return [];
        }

        return ['Authorization' => 'Bearer '.$super->createToken('oauth')->plainTextToken];
    }

    private function refuse(TestResponse $reponse, string $code): void
    {
        $reponse->assertForbidden();
        $this->assertSame($code, $reponse->json('code') ?? $reponse->json('error_code'));
    }
}
