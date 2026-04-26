<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Policy tests for ActivityLogPolicy@export (TCK-104).
 */
class ExportActivityLogPolicyTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_agency_admin_can_access_export(): void
    {
        $this->apiActingAsRole('agency_admin');
        // Returns 422 (missing format) not 403 — proves the gate was passed.
        $this->apiGet('/api/activity-logs/export')->assertUnprocessable();
    }

    public function test_super_admin_can_access_export(): void
    {
        $this->apiActingAsRole('super_admin');
        $this->apiGet('/api/activity-logs/export')->assertUnprocessable();
    }

    public function test_agent_cannot_export(): void
    {
        $this->apiActingAsRole('agent');
        $this->apiGet('/api/activity-logs/export?format=csv')->assertForbidden();
    }

    public function test_owner_cannot_export(): void
    {
        $this->apiActingAsRole('owner');
        $this->apiGet('/api/activity-logs/export?format=csv')->assertForbidden();
    }

    public function test_admin_role_cannot_export(): void
    {
        // 'admin' is the legacy role — only agency_admin and super_admin are allowed.
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('admin', ['agency' => $agency]);
        $this->apiGet('/api/activity-logs/export?format=csv')->assertForbidden();
    }
}
