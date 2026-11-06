<?php

namespace Tests\Feature\Api\Agency;

use App\Domain\Settings\AgencySettings;
use App\Models\Agency;
use App\Models\User;
use App\Support\Security\TwoFactorRequirement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Revue de TCK-2487 — la règle `boolean` accepte `1`, `"1"`, `0`, `"0"`, mais `TwoFactorRequirement`
 * lit `settings->require_team_two_factor` en JSON STRICT (`= true`). Stocker la valeur validée telle
 * quelle laissait un client écrire `1` : réglage accepté, rendu activé par `AgencySettings::read()`,
 * et 2FA d'équipe NON exigée. Toute clé `bool` du catalogue `AgencySettings` s'écrit désormais en
 * vrai booléen JSON.
 */
class AgencySettingsBooleensStockesTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->agency->forceFill(['primary_admin_id' => $admin->id])->save();
    }

    public function test_un_1_exige_la_2fa_de_l_equipe_et_un_0_la_leve(): void
    {
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $this->agency);

        $this->patchJson("/api/agencies/{$this->agency->id}", ['settings' => ['require_team_two_factor' => 1]])->assertOk();
        $this->assertTrue($this->stocke('require_team_two_factor'));
        $this->assertTrue(TwoFactorRequirement::requiredAtAgency($agent, $this->agency->id), '`1` accepté doit exiger la 2FA de l\'équipe');

        $this->patchJson("/api/agencies/{$this->agency->id}", ['settings' => ['require_team_two_factor' => '0']])->assertOk();
        $this->assertFalse($this->stocke('require_team_two_factor'));
        $this->assertFalse(TwoFactorRequirement::requiredAtAgency($agent, $this->agency->id));
    }

    /** @return array<string, array{0: string}> */
    public static function clesBooleennes(): array
    {
        $cles = array_filter(AgencySettings::keys(), static fn (string $cle): bool => is_bool(AgencySettings::default($cle)));

        return array_combine($cles, array_map(static fn (string $cle): array => [$cle], $cles));
    }

    #[DataProvider('clesBooleennes')]
    public function test_toute_cle_booleenne_du_catalogue_s_ecrit_en_vrai_booleen_json(string $cle): void
    {
        foreach ([[1, true], ['1', true], [true, true], [0, false], ['0', false], [false, false]] as [$valeur, $attendu]) {
            $this->patchJson("/api/agencies/{$this->agency->id}", ['settings' => [$cle => $valeur]])->assertOk();
            $this->assertSame($attendu, $this->stocke($cle), "{$cle} envoyé à ".var_export($valeur, true));
        }
    }

    public function test_le_catalogue_a_des_cles_booleennes(): void
    {
        $this->assertContains('require_team_two_factor', array_keys(self::clesBooleennes()));
    }

    /** La valeur telle que la COLONNE la porte, décodée du JSON brut (sans le cast du modèle). */
    private function stocke(string $cle): mixed
    {
        $brut = DB::table('agencies')->where('id', $this->agency->id)->value('settings');

        return json_decode((string) $brut, true)[$cle] ?? null;
    }
}
