<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Models\Agency;
use App\Models\User;
use App\Services\Agency\AgentAbsenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-589, fusion de TCK-591 — la passation (`POST agencies/{a}/members/{u}/handover`) RETIRE un
 * membre avec `remove_after` et transmet son portefeuille ; l'absence (`agencies/{a}/absences`)
 * est une délégation (`RoleDelegation`) qui fait couvrir les tâches de l'absent par un suppléant.
 * Ce sont des gestes d'équipe, de la même famille que `removeAgent` et
 * `RoleDelegationController@store` : la 2FA les exige d'un admin d'agence, et du personnel quand
 * l'agence a coché `require_team_two_factor`.
 *
 * Rouge à la fusion de `f6a2a868` : leurs deux fichiers de routes n'étaient dans aucune famille.
 * `removeAgent` refusait un admin sans 2FA, la passation `remove_after` le laissait retirer le
 * même membre — et `ProtectedActionsCoverageTest` restait vert, faute de les voir.
 */
class TeamHandoverAbsenceTwoFactorTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $suppleant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->agent = $this->membre('agent');
        $this->suppleant = $this->membre('agent');
    }

    /** @return array<string, array{0: string}> */
    public static function gestes(): array
    {
        return [
            'POST handover (remove_after)' => ['handover'],
            'POST absences' => ['absence'],
            'DELETE absences/{d}' => ['revocation'],
        ];
    }

    #[DataProvider('gestes')]
    public function test_un_admin_d_agence_sans_2fa_recoit_403(string $geste): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency, 'two_factor_enabled' => false]);

        $this->appeler($geste)->assertForbidden()->assertJsonPath('code', 'two_factor_required');
    }

    #[DataProvider('gestes')]
    public function test_un_admin_d_agence_avec_2fa_passe_la_garde(string $geste): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency]);

        $this->assertNotSame('two_factor_required', $this->appeler($geste)->json('code'));
    }

    public function test_la_passation_refusee_ne_retire_personne(): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency, 'two_factor_enabled' => false]);

        $this->appeler('handover')->assertForbidden();

        $this->assertNotSoftDeleted('agent_profiles', ['user_id' => $this->agent->id, 'agency_id' => $this->agency->id]);
    }

    public function test_l_agent_qui_declare_sa_propre_absence_n_est_concerne_qu_avec_l_interrupteur(): void
    {
        $this->actingAs($this->agent, 'sanctum');
        $this->assertNotSame('two_factor_required', $this->appeler('absence')->json('code'));

        $this->agency->update(['settings' => ['require_team_two_factor' => true]]);
        $this->appeler('absence', ['ends_at' => now()->addDays(9)->toIso8601String()])
            ->assertForbidden()->assertJsonPath('code', 'two_factor_required');
    }

    public function test_les_lectures_restent_ouvertes(): void
    {
        $this->actingAsRole('agency_admin', ['agency' => $this->agency, 'two_factor_enabled' => false]);

        $this->getJson("/api/agencies/{$this->agency->id}/members/{$this->agent->id}/portfolio")->assertOk();
        $this->getJson("/api/agencies/{$this->agency->id}/absences")->assertOk();
    }

    /** @param  array<string, mixed>  $surcharge */
    private function appeler(string $geste, array $surcharge = []): TestResponse
    {
        $base = "/api/agencies/{$this->agency->id}";

        return match ($geste) {
            'handover' => $this->postJson("{$base}/members/{$this->agent->id}/handover", ['leave_unassigned' => true, 'remove_after' => true]),
            'absence' => $this->postJson("{$base}/absences", $surcharge + [
                'user_id' => $this->agent->id,
                'substitute_id' => $this->suppleant->id,
                'ends_at' => now()->addDays(5)->toIso8601String(),
            ]),
            'revocation' => $this->deleteJson("{$base}/absences/".app(AgentAbsenceService::class)->declare(
                $this->agency,
                $this->membre('agency_admin'),
                ['user_id' => $this->agent->id, 'substitute_id' => $this->suppleant->id, 'ends_at' => now()->addDays(5)->toIso8601String()],
            )->id),
        };
    }

    private function membre(string $role): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, $role, $this->agency);

        return $user;
    }
}
