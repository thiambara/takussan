<?php

namespace Tests\Feature\Team;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

/**
 * TCK-258 — covers GET /team listing + suspend/reactivate/remove
 * lifecycle for an existing agent profile.
 */
class TeamManagementTest extends BaseTestCase
{
    use RefreshDatabase;

    /**
     * @return array{Agency, User}
     */
    private function standardAgencyWithAdmin(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $admin = $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        return [$agency, $admin];
    }

    public function test_team_listing_returns_active_and_draft_profiles(): void
    {
        [$agency] = $this->standardAgencyWithAdmin();

        // Active member.
        $activeUser = User::factory()->create();
        AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $activeUser->id,
            'status' => AgentProfileStatus::Active->value,
        ]);

        // Draft (pending invitation).
        AgentProfile::query()->create([
            'agency_id' => $agency->id,
            'user_id' => null,
            'status' => AgentProfileStatus::Draft->value,
            'metadata' => [
                'email' => 'pending@example.com',
                'first_name' => 'Pending',
                'last_name' => 'One',
            ],
        ]);

        $response = $this->getJson("/api/agencies/{$agency->id}/team?fields[agent_profiles]=id,status,user_id&include=user");

        $response->assertStatus(200);
        $payload = $response->json();
        $this->assertCount(2, $payload['data']);
        $statuses = array_column($payload['data'], 'status');
        $this->assertContains('active', $statuses);
        $this->assertContains('draft', $statuses);
    }

    public function test_team_listing_excludes_soft_deleted_profiles(): void
    {
        [$agency] = $this->standardAgencyWithAdmin();

        $removed = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Active->value,
        ]);
        $removed->delete();

        $response = $this->getJson("/api/agencies/{$agency->id}/team");
        $response->assertStatus(200);
        $ids = array_column($response->json('data'), 'id');
        $this->assertNotContains($removed->id, $ids);
    }

    public function test_team_listing_forbidden_for_individual_agency(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $this->getJson("/api/agencies/{$agency->id}/team")->assertStatus(403);
    }

    public function test_suspend_flips_status_and_logs_activity(): void
    {
        [$agency, $admin] = $this->standardAgencyWithAdmin();

        $profile = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Active->value,
        ]);

        $this->patchJson("/api/profiles/{$profile->id}/suspend")
            ->assertStatus(200)
            ->assertJsonPath('data.status', AgentProfileStatus::Suspended->value);

        $this->assertSame(
            AgentProfileStatus::Suspended,
            $profile->fresh()->status
        );

        $log = Activity::query()->where('event', 'agent_suspended')->first();
        $this->assertNotNull($log);
        $this->assertSame($admin->id, $log->causer_id);
    }

    public function test_reactivate_flips_back_to_active(): void
    {
        [$agency] = $this->standardAgencyWithAdmin();

        $profile = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Suspended->value,
        ]);

        $this->patchJson("/api/profiles/{$profile->id}/suspend", ['active' => true])
            ->assertStatus(200)
            ->assertJsonPath('data.status', AgentProfileStatus::Active->value);

        $log = Activity::query()->where('event', 'agent_reactivated')->first();
        $this->assertNotNull($log);
    }

    public function test_remove_soft_deletes_and_logs_activity(): void
    {
        [$agency] = $this->standardAgencyWithAdmin();

        $profile = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Active->value,
        ]);

        $this->deleteJson("/api/profiles/{$profile->id}")
            ->assertStatus(204);

        $this->assertSoftDeleted('agent_profiles', ['id' => $profile->id]);

        $log = Activity::query()->where('event', 'agent_removed')->first();
        $this->assertNotNull($log);
    }

    public function test_suspend_forbidden_without_manage_team(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agent', ['agency_id' => $agency->id]);

        $profile = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Active->value,
        ]);

        $this->patchJson("/api/profiles/{$profile->id}/suspend")
            ->assertStatus(403);
    }
}
