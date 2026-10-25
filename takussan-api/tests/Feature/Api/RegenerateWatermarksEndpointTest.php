<?php

namespace Tests\Feature\Api;

use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

class RegenerateWatermarksEndpointTest extends TestCase
{
    use CreatesAgencyMembers, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
    }

    private function createAdminAndAgency(): array
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);
        $admin->update(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);

        return [$admin, $agency];
    }

    public function test_admin_agence_can_trigger_regeneration(): void
    {
        [$admin, $agency] = $this->createAdminAndAgency();

        $response = $this->actingAs($admin)
            ->postJson("/api/agencies/{$agency->id}/regenerate-watermarks");

        $response->assertStatus(202)
            ->assertJson(['queued' => true, 'agency_id' => $agency->id]);

        Queue::assertPushed(RegenerateAgencyWatermarksJob::class, fn ($job) => $job->agencyId === $agency->id);
    }

    public function test_non_admin_returns_403(): void
    {
        [$admin, $agency] = $this->createAdminAndAgency();
        $agent = User::factory()->create(['agency_id' => $agency->id]);

        $response = $this->actingAs($agent)
            ->postJson("/api/agencies/{$agency->id}/regenerate-watermarks");

        $response->assertStatus(403);
        Queue::assertNothingPushed();
    }

    public function test_super_admin_can_trigger_regeneration_for_any_agency(): void
    {
        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');

        [, $agency] = $this->createAdminAndAgency();

        $response = $this->actingAs($superAdmin)
            ->postJson("/api/agencies/{$agency->id}/regenerate-watermarks");

        $response->assertStatus(202);
        Queue::assertPushed(RegenerateAgencyWatermarksJob::class);
    }

    /**
     * TCK-2311 (P225.04, décision du porteur) — le geste est jugé par `AgencyPolicy::configure`,
     * comme le logo (TCK-106 l'écrit « admin agence ») : un co-administrateur qui tient
     * `agency.update` régénère, sans l'administrateur principal.
     */
    public function test_le_co_administrateur_qui_tient_agency_update_declenche_la_regeneration(): void
    {
        [$principal, $agency] = $this->createAdminAndAgency();
        $coAdmin = $this->agencyAdmin($agency);

        $this->actingAs($coAdmin)
            ->postJson("/api/agencies/{$agency->id}/regenerate-watermarks")
            ->assertStatus(202);

        Queue::assertPushed(RegenerateAgencyWatermarksJob::class, fn ($job) => $job->agencyId === $agency->id);
        $this->assertNotSame($coAdmin->id, $principal->id);
    }

    /** Un rôle personnalisé qui retire `agency.update` à l'admin lui retire ce geste. */
    public function test_le_co_administrateur_sans_agency_update_est_refuse(): void
    {
        [, $agency] = $this->createAdminAndAgency();

        $this->actingAs($this->adminWithout($agency, Capability::AgencyUpdate))
            ->postJson("/api/agencies/{$agency->id}/regenerate-watermarks")
            ->assertForbidden();

        Queue::assertNothingPushed();
    }

    /** Aucun agent ne gagne le geste, même s'il tient `agency.update`. */
    public function test_l_agent_qui_tient_agency_update_est_refuse(): void
    {
        [, $agency] = $this->createAdminAndAgency();

        $this->actingAs($this->agentWith($agency, Capability::AgencyUpdate))
            ->postJson("/api/agencies/{$agency->id}/regenerate-watermarks")
            ->assertForbidden();

        Queue::assertNothingPushed();
    }

    /** L'admin principal ne s'enferme pas dehors, même si son rôle retire la capacité. */
    public function test_l_admin_principal_sans_agency_update_declenche_encore(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->adminWithout($agency, Capability::AgencyUpdate);
        $agency->forceFill(['primary_admin_id' => $admin->id])->save();

        $this->actingAs($admin)
            ->postJson("/api/agencies/{$agency->id}/regenerate-watermarks")
            ->assertStatus(202);
    }

    public function test_endpoint_validates_agency_exists(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->postJson('/api/agencies/99999/regenerate-watermarks');

        $response->assertStatus(404);
    }
}
