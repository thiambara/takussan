<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\TaskStatus;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-617 AC6, point 6 (décision du porteur, 2026-11-16, option a) — l'admin d'agence SANS
 * `reports.view_agency` ne lit sur `/dashboard/me` que SES chiffres non financiers, comme un agent :
 * la tâche d'un collègue n'y entre pas, le portefeuille de l'agence non plus. AVEC la capacité, la vue
 * d'agence est inchangée.
 */
class DashboardMeAgencyAdminScopeTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $colleague;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->colleague = User::factory()->create();
        $this->materializeRoleProfile($this->colleague, 'agent', $this->agency);
        Property::factory()->count(3)->create(['agency_id' => $this->agency->id]);
    }

    private function openTaskFor(User $assignee): void
    {
        Task::factory()->create([
            'status' => TaskStatus::Open,
            'taskable_type' => Customer::class,
            'taskable_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'assigned_to_id' => $assignee->id,
            'created_by_id' => $assignee->id,
            'due_at' => now()->addDays(3),
        ]);
    }

    public function test_without_reports_the_admin_reads_his_own_figures_only(): void
    {
        $admin = $this->adminWithout($this->agency, Capability::ReportsViewAgency);
        $this->openTaskFor($admin);
        $this->openTaskFor($this->colleague);
        $this->openTaskFor($this->colleague);

        $data = $this->actingAsApi($admin)->getJson('/api/dashboard/me')->assertOk()->json('data');

        $this->assertSame('agent', $data['role']);
        $this->assertSame(1, $data['metrics']['tasks_open']);
        foreach (['properties_total', 'customers_count', 'members_count', 'leases_active', 'revenue_month', 'commission_month'] as $key) {
            $this->assertArrayNotHasKey($key, $data['metrics'], $key);
        }
    }

    public function test_with_reports_the_admin_reads_the_agency(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $this->openTaskFor($this->colleague);

        $data = $this->actingAsApi($admin)->getJson('/api/dashboard/me')->assertOk()->json('data');

        $this->assertSame('agency_admin', $data['role']);
        $this->assertSame(3, $data['metrics']['properties_total']);
        $this->assertArrayHasKey('revenue_month', $data['metrics']);
    }
}
