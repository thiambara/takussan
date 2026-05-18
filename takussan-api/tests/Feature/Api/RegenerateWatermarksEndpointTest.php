<?php

namespace Tests\Feature\Api;

use App\Jobs\Media\RegenerateAgencyWatermarksJob;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class RegenerateWatermarksEndpointTest extends TestCase
{
    use RefreshDatabase;

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
        Role::findOrCreate('super_admin');
        $superAdmin = User::factory()->create();
        $superAdmin->assignRole('super_admin');

        [, $agency] = $this->createAdminAndAgency();

        $response = $this->actingAs($superAdmin)
            ->postJson("/api/agencies/{$agency->id}/regenerate-watermarks");

        $response->assertStatus(202);
        Queue::assertPushed(RegenerateAgencyWatermarksJob::class);
    }

    public function test_endpoint_validates_agency_exists(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->postJson('/api/agencies/99999/regenerate-watermarks');

        $response->assertStatus(404);
    }
}
