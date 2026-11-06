<?php

namespace Tests\Feature\Database;

use App\Domain\Settings\AgencySettings;
use App\Models\Agency;
use App\Models\User;
use App\Support\Security\TwoFactorRequirement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Revue de TCK-2487 — la migration de données qui réécrit en vrai booléen JSON les clés `bool` du
 * catalogue `AgencySettings` déjà stockées en `1`, `"1"`, `"0"`… par la même fonction que l'écriture
 * (`AgencySettings::normalize()`). Elle ne touche à aucune autre clé, ne réécrit pas une valeur que
 * `read()` ne reconnaît pas, et se rejoue sans effet.
 */
class NormalizeBooleanAgencySettingsMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'migrations/2026_11_06_100000_normalize_boolean_agency_settings.php';

    public function test_les_cles_booleennes_deviennent_des_booleens_json_et_le_reste_est_intact(): void
    {
        $agence = Agency::factory()->create();
        $this->ecrireBrut($agence, '{"require_team_two_factor": "1", "watermark_enabled": 1, "late_fee_online_collection": "0",'
            .' "tenant_onboarding_enabled": "oui", "primary_city": "Dakar", "hidden_modules": ["crm"], "vide": {}, "booking_pending_expiry_hours": "12"}');
        $sansReglage = Agency::factory()->create();
        $this->ecrireBrut($sansReglage, null);
        $dejaPropre = Agency::factory()->create();
        $this->ecrireBrut($dejaPropre, '{"require_team_two_factor": false, "watermark_enabled": true}');

        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agence);
        $this->assertFalse(TwoFactorRequirement::requiredAtAgency($agent, $agence->id), 'avant : "1" n\'exige pas la 2FA (lecteur SQL strict)');
        $luAvant = $this->luParLeCatalogue($agence);
        $propreAvant = $this->brut($dejaPropre);

        $migration = require database_path(self::MIGRATION);
        $migration->up();
        $apresUneFois = $this->brut($agence);
        $migration->up();

        $this->assertSame($apresUneFois, $this->brut($agence), 'rejouée, la migration ne change rien');
        $this->assertSame([
            'require_team_two_factor' => true,
            'watermark_enabled' => true,
            'late_fee_online_collection' => false,
            'tenant_onboarding_enabled' => 'oui', // non reconnue par read() : laissée telle quelle
            'primary_city' => 'Dakar',
            'hidden_modules' => ['crm'],
            'vide' => [],
            'booking_pending_expiry_hours' => '12', // clé `int` : hors de la normalisation
        ], self::trie(json_decode((string) $this->brut($agence), true)));
        $this->assertSame('object', DB::scalar("select jsonb_typeof(settings->'vide') from agencies where id = ?", [$agence->id]), 'un objet vide reste un objet : seules les clés booléennes sont réécrites');

        $this->assertSame($luAvant, $this->luParLeCatalogue($agence), 'read() rend, clé par clé, la même valeur avant et après');
        $this->assertTrue(TwoFactorRequirement::requiredAtAgency($agent, $agence->id), 'après : la 2FA de l\'équipe est exigée');
        $this->assertNull($this->brut($sansReglage));
        $this->assertSame($propreAvant, $this->brut($dejaPropre));

        // Le retour est délibérément sans effet (cf. le down() de la migration) : il ne lève pas.
        $migration->down();
        $this->assertSame($apresUneFois, $this->brut($agence));
    }

    private function ecrireBrut(Agency $agence, ?string $json): void
    {
        DB::update('update agencies set settings = ?::jsonb where id = ?', [$json, $agence->id]);
    }

    private function brut(Agency $agence): ?string
    {
        return DB::table('agencies')->where('id', $agence->id)->value('settings');
    }

    /** @return array<string, mixed> */
    private function luParLeCatalogue(Agency $agence): array
    {
        $settings = json_decode((string) $this->brut($agence), true);

        return array_combine(AgencySettings::keys(), array_map(static fn (string $cle): mixed => AgencySettings::read($settings, $cle), AgencySettings::keys()));
    }

    /**
     * @param  array<string, mixed>  $tableau
     * @return array<string, mixed>
     */
    private static function trie(array $tableau): array
    {
        $ordre = ['require_team_two_factor', 'watermark_enabled', 'late_fee_online_collection', 'tenant_onboarding_enabled', 'primary_city', 'hidden_modules', 'vide', 'booking_pending_expiry_hours'];

        return array_replace(array_flip($ordre), $tableau);
    }
}
