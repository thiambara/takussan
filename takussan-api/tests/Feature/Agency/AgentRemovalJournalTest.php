<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Profiles\AgentProfile;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-591 §8 — le second chemin de retrait (`DELETE /api/profiles/{agent_profile}`, par
 * `AgentInvitationService::remove`) passe par le même service : même journal `Membership`, même
 * refus d'un portefeuille non vide.
 */
class AgentRemovalJournalTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_the_profile_path_journals_and_guards_the_portfolio_like_the_team_screen(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        // TCK-589 (fusion) — retirer un membre est un geste d'équipe protégé : l'admin a sa 2FA.
        $admin = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $profile = AgentProfile::query()->where('user_id', $agent->id)->sole();
        Task::factory()->forCustomer(Customer::factory()->create(['agency_id' => $agency->id]))
            ->create(['created_by_id' => $admin->id, 'assigned_to_id' => $agent->id]);

        $this->actingAsApi($admin)->deleteJson("/api/profiles/{$profile->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'agency_member.portfolio_not_empty');

        $this->actingAsApi($admin)->deleteJson("/api/profiles/{$profile->id}", ['leave_unassigned' => true])
            ->assertNoContent();

        $this->assertSoftDeleted('agent_profiles', ['id' => $profile->id]);
        $log = Activity::query()->where('log_name', 'Membership')->sole();
        $this->assertSame('agent_removed', $log->event);
        $this->assertSame($agency->id, $log->properties['agency_id']);
    }
}
