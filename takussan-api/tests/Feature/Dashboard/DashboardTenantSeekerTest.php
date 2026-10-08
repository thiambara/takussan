<?php

namespace Tests\Feature\Dashboard;

use App\Models\Customer;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\VisitStatus;
use App\Models\MaintenanceRequest;
use App\Models\PropertyVisit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-595 — AC16 : le client sans dossier reçoit son accueil, et le client avec dossier y lit ses
 * prochaines visites et ses demandes d'intervention.
 */
class DashboardTenantSeekerTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_a_brand_new_account_gets_zeros_instead_of_a_short_circuit(): void
    {
        $user = $this->apiActingAsRole('customer');
        MaintenanceRequest::factory()->create(['requester_id' => $user->id, 'status' => MaintenanceStatus::Open]);

        $data = $this->apiGet('/api/dashboard/tenant')->assertOk()->json('data');

        $this->assertFalse($data['has_customer_profile']);
        $this->assertSame(0, $data['leases']['active']);
        $this->assertSame([], $data['visits']['upcoming']);
        // Ce que le compte possède en propre n'attend pas la fiche client.
        $this->assertSame(1, $data['maintenance']['open']);
    }

    public function test_upcoming_visits_on_the_clients_record_are_listed(): void
    {
        $user = $this->apiActingAsRole('customer');
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $visit = PropertyVisit::factory()->create([
            'customer_id' => $customer->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(2),
        ]);
        PropertyVisit::factory()->create(['customer_id' => $customer->id, 'status' => VisitStatus::Cancelled, 'scheduled_at' => now()->addDay()]);
        PropertyVisit::factory()->create(['customer_id' => $customer->id, 'status' => VisitStatus::Scheduled, 'scheduled_at' => now()->subDay()]);

        $upcoming = $this->apiGet('/api/dashboard/tenant')->assertOk()->json('data.visits.upcoming');

        $this->assertSame([$visit->id], array_column($upcoming, 'id'));

        $this->apiGet('/api/dashboard/me')
            ->assertOk()
            ->assertJsonPath('data.role', 'tenant')
            ->assertJsonPath('data.metrics.visits_upcoming.0.id', $visit->id);
    }
}
