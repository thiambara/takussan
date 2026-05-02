<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\BaseTestCase;

/**
 * TCK-144 — Cross-tenant audit visibility for super-admin. The
 * agency_admin-scoped path is covered by AuditLogControllerTest.
 */
class CrossTenantAuditTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_super_admin_sees_logs_from_every_agency(): void
    {
        $this->actingAsRole('super_admin');
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        // Trigger two log entries from different tenants by issuing the
        // verify endpoint twice — drives the activity logger naturally.
        $this->postJson("/api/admin/agencies/{$agencyA->id}/verify")->assertOk();
        $this->postJson("/api/admin/agencies/{$agencyB->id}/verify")->assertOk();

        $response = $this->getJson('/api/admin/audit?filter[event]=super_admin_agency_verified&sort=-created_at')
            ->assertOk()
            ->assertJsonStructure(['data' => [['id', 'event', 'subject_id']], 'meta' => ['total']]);

        $events = collect($response->json('data'))->pluck('subject_id')->all();
        $this->assertContains($agencyA->id, $events);
        $this->assertContains($agencyB->id, $events);
    }

    public function test_filters_by_causer_id(): void
    {
        $actor = $this->actingAsRole('super_admin');
        $other = User::factory()->create();
        $agency = Agency::factory()->create();

        $this->postJson("/api/admin/agencies/{$agency->id}/suspend")->assertOk();

        $this->getJson("/api/admin/audit?filter[causer_id]={$actor->id}&filter[event]=super_admin_agency_suspended")
            ->assertOk()
            ->assertJsonPath('meta.total', fn ($v) => $v >= 1);

        $this->getJson("/api/admin/audit?filter[causer_id]={$other->id}&filter[event]=super_admin_agency_suspended")
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }
}
