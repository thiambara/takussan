<?php

namespace Tests\Feature\Middleware;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-144 — `super-admin` middleware unit. Probes the gate with each of the
 * three states (anonymous / agency_admin / super_admin) and asserts the
 * status codes documented in the contract.
 */
class EnsureSuperAdminTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_request_returns_401(): void
    {
        $this->getJson('/api/admin/system/metrics')
            ->assertStatus(401);
    }

    public function test_agency_admin_is_blocked_with_403(): void
    {
        $this->actingAsRole('agency_admin');

        $this->getJson('/api/admin/system/metrics')
            ->assertStatus(403)
            ->assertJsonPath('message', 'Super-admin access required.');
    }

    public function test_super_admin_passes_through_with_200(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/system/metrics')
            ->assertOk()
            ->assertJsonStructure(['data' => ['agencies', 'users', 'properties', 'leases', 'revenue']]);
    }
}
