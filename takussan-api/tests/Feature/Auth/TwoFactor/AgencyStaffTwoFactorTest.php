<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Integration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-589 AC8 — la 2FA exigée là où l'argent circule (contrainte 7) : un admin
 * d'agence sans second facteur ne touche plus aux reversements, aux intégrations
 * (l'alias `PATCH` SANS NOM compris), ni aux rôles ; avec l'interrupteur d'agence
 * `settings.require_team_two_factor`, l'agent non plus. Jamais le bailleur.
 *
 * Rouge sur `5f872f1f` : aucun middleware d'exigence 2FA n'existait.
 */
class AgencyStaffTwoFactorTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
    }

    /** @return array<string, array{0: string}> */
    public static function routes(): array
    {
        return [
            'POST /payouts' => ['payout'],
            'PATCH /integrations/{id} (sans nom)' => ['integration'],
            'PUT /agencies/{a}/roles/{r}/capabilities' => ['capabilities'],
        ];
    }

    #[DataProvider('routes')]
    public function test_un_admin_d_agence_sans_2fa_recoit_403(string $route): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency, 'two_factor_enabled' => false]);

        $this->appeler($route)->assertForbidden()->assertJsonPath('code', 'two_factor_required');
    }

    #[DataProvider('routes')]
    public function test_un_admin_d_agence_avec_2fa_passe_la_garde(string $route): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency]);

        $this->assertNotSame('two_factor_required', $this->appeler($route)->json('code'));
    }

    #[DataProvider('routes')]
    public function test_un_bailleur_sans_2fa_n_est_pas_concerne(string $route): void
    {
        $this->actingAsRole('owner', ['agency' => $this->agency]);

        $this->assertNotSame('two_factor_required', $this->appeler($route)->json('code'));
    }

    #[DataProvider('routes')]
    public function test_un_agent_sans_2fa_n_est_concerne_qu_avec_l_interrupteur(string $route): void
    {
        $this->actingAsRole('agent', ['agency' => $this->agency]);
        $this->assertNotSame('two_factor_required', $this->appeler($route)->json('code'));

        $this->agency->forceFill(['settings' => ['require_team_two_factor' => true]])->save();
        $this->appeler($route)->assertForbidden()->assertJsonPath('code', 'two_factor_required');
    }

    public function test_l_interrupteur_d_une_autre_agence_ne_concerne_pas_l_agent(): void
    {
        Agency::factory()->create(['settings' => ['require_team_two_factor' => true]]);
        $this->actingAsRole('agent', ['agency' => $this->agency]);

        $this->assertNotSame('two_factor_required', $this->appeler('capabilities')->json('code'));
    }

    public function test_une_lecture_de_famille_reste_ouverte(): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency, 'two_factor_enabled' => false]);

        $this->getJson('/api/payouts')->assertOk();
    }

    public function test_l_interrupteur_se_pose_par_la_mise_a_jour_de_l_agence_sans_effacer_les_autres_reglages(): void
    {
        $this->agency->forceFill(['settings' => ['watermark_enabled' => true]])->save();
        $admin = $this->actingAsRole('agency_admin', ['agency' => $this->agency]);
        $this->agency->forceFill(['primary_admin_id' => $admin->id])->save();

        $this->patchJson("/api/agencies/{$this->agency->id}", ['settings' => ['require_team_two_factor' => true]])
            ->assertOk()
            ->assertJsonPath('data.settings.require_team_two_factor', true)
            ->assertJsonPath('data.settings.watermark_enabled', true);
    }

    private function appeler(string $route): TestResponse
    {
        return match ($route) {
            'payout' => $this->postJson('/api/payouts', []),
            'integration' => $this->patchJson(
                '/api/integrations/'.Integration::factory()->create(['agency_id' => $this->agency->id])->id,
                ['is_active' => false],
            ),
            'capabilities' => $this->putJson(
                "/api/agencies/{$this->agency->id}/roles/".AgencyRole::factory()->create(['agency_id' => $this->agency->id])->id.'/capabilities',
                ['capabilities' => []],
            ),
        };
    }
}
