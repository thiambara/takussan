<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * P127.06 (TCK-1363) — un test de VALEUR par clé servie, sur un jeu aux valeurs non nulles et
 * distinctes. Plusieurs clés n'étaient assertées qu'en structure, à 0 ou par `>= 1`, et les
 * adaptateurs de `/dashboard/me` recopient par `?? 0` : un renommage dans un service y rendrait 0 en
 * silence, sans qu'aucun test ne rougisse.
 */
class DashboardKeyValuesTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_every_agent_key_and_its_dashboard_me_copy_carry_their_value(): void
    {
        Carbon::setTestNow('2026-07-15 09:00:00');
        $agency = Agency::factory()->create();
        $agent = $this->apiActingAsRole('agent', ['agency' => $agency]);

        // 2 biens gérés.
        [$property] = Property::factory()->count(2)->create(['agency_id' => $agency->id, 'user_id' => $agent->id])->all();
        // Pipeline : 3 prospects, 1 qualifié → 4.
        Customer::factory()->count(3)->create(['agency_id' => $agency->id, 'added_by_id' => $agent->id, 'pipeline_stage' => CustomerPipelineStage::Prospect]);
        Customer::factory()->create(['agency_id' => $agency->id, 'added_by_id' => $agent->id, 'pipeline_stage' => CustomerPipelineStage::Qualified]);
        // 1 réservation en attente.
        Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id, 'status' => BookingStatus::Pending]);
        // 3 visites dans les 7 jours.
        foreach (['2026-07-16 10:00:00', '2026-07-17 10:00:00', '2026-07-18 10:00:00'] as $at) {
            PropertyVisit::factory()->create(['property_id' => $property->id, 'agent_id' => $agent->id, 'status' => VisitStatus::Scheduled, 'scheduled_at' => $at]);
        }
        // 5 tâches ouvertes : 2 en retard, 1 du jour, 2 à venir.
        foreach (['2026-07-10 10:00:00', '2026-07-12 10:00:00', '2026-07-15 15:00:00', '2026-07-20 10:00:00', '2026-07-25 10:00:00'] as $due) {
            Task::create([
                'title' => 'Tâche '.$due,
                'taskable_type' => Property::class,
                'taskable_id' => $property->id,
                'assigned_to_id' => $agent->id,
                'created_by_id' => $agent->id,
                'status' => TaskStatus::Open,
                'priority' => TaskPriority::Medium,
                'due_at' => $due,
            ]);
        }
        // 6 interventions ouvertes.
        MaintenanceRequest::factory()->count(6)->create(['property_id' => $property->id, 'assigned_to' => $agent->id, 'status' => MaintenanceStatus::Assigned]);
        // Commissions : 70 000 ce mois-ci, 20 000 en mars → 90 000 sur l'année.
        // Une ligne par (bail, bénéficiaire) : deux baux.
        foreach ([[70_000, '2026-07-05 10:00:00'], [20_000, '2026-03-05 10:00:00']] as [$amount, $at]) {
            $lease = Lease::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id]);
            CommissionEntry::factory()->create([
                'agency_id' => $agency->id, 'lease_id' => $lease->id, 'beneficiary_id' => $agent->id,
                'amount' => $amount, 'status' => CommissionEntryStatus::Due, 'earned_at' => $at,
            ]);
        }

        $data = $this->apiGet('/api/dashboard/agent')->assertOk()->json('data');

        $this->assertSame(2, $data['properties_managed']);
        $this->assertSame(3, $data['pipeline'][CustomerPipelineStage::Prospect->value]);
        $this->assertSame(1, $data['pipeline'][CustomerPipelineStage::Qualified->value]);
        $this->assertSame(1, $data['bookings']['pending']);
        $this->assertSame(3, $data['visits']['upcoming_7d']);
        $this->assertSame(5, $data['tasks']['open']);
        $this->assertSame(2, $data['tasks']['overdue']);
        $this->assertSame(1, $data['tasks']['today']);
        $this->assertSame(6, $data['maintenance']['open']);
        $this->assertEquals(70_000.0, $data['finance']['commissions_month']);
        $this->assertEquals(90_000.0, $data['finance']['commissions_year']);

        $me = $this->apiGet('/api/dashboard/me')->assertOk()->json('data');
        $this->assertSame('agent', $me['role']);
        $metrics = $me['metrics'];
        $this->assertSame(2, $metrics['properties_managed']);
        $this->assertSame(4, $metrics['pipeline_total']);
        $this->assertSame(3, $metrics['pipeline_by_stage'][CustomerPipelineStage::Prospect->value]);
        $this->assertSame(1, $metrics['bookings_pending']);
        $this->assertSame(3, $metrics['visits_upcoming_7d']);
        $this->assertEquals(70_000.0, $metrics['commissions_month']);
        $this->assertSame(5, $metrics['tasks_open']);
        $this->assertSame(2, $metrics['tasks_overdue']);
        $this->assertSame(6, $metrics['maintenance_open']);
    }

    public function test_every_owner_key_and_its_dashboard_me_copy_carry_their_value(): void
    {
        Carbon::setTestNow('2026-07-15 09:00:00');
        $agency = Agency::factory()->create();
        $owner = $this->apiActingAsRole('owner', ['agency' => $agency]);
        $bien = fn (PropertyStatus $status) => Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id, 'status' => $status]);

        $rented = [$bien(PropertyStatus::Rented), $bien(PropertyStatus::Rented)];
        foreach ([1, 2, 3] as $_) {
            $bien(PropertyStatus::Available);
        }
        // 2 baux actifs, 100 000 + 150 000 attendus par mois.
        foreach ([[$rented[0], 100_000], [$rented[1], 150_000]] as [$property, $rent]) {
            Lease::factory()->create([
                'property_id' => $property->id, 'landlord_id' => $owner->id, 'agency_id' => $agency->id,
                'status' => LeaseStatus::Active, 'monthly_rent' => $rent,
            ]);
        }
        // 4 réservations en attente.
        Booking::factory()->count(4)->create(['property_id' => $rented[0]->id, 'agency_id' => $agency->id, 'status' => BookingStatus::Pending]);
        // Le bail peut toucher au statut du bien : les statuts sont reposés à la fin.
        Property::query()->whereIn('id', [$rented[0]->id, $rented[1]->id])->update(['status' => PropertyStatus::Rented->value]);

        $data = $this->apiGet('/api/dashboard/owner')->assertOk()->json('data');

        $this->assertSame(['total' => 5, 'rented' => 2, 'available' => 3], $data['portfolio']);
        $this->assertSame(2, $data['leases']['active']);
        $this->assertSame(4, $data['bookings']['pending']);
        $this->assertEquals(250_000.0, $data['finance']['expected_monthly']);

        $metrics = $this->apiGet('/api/dashboard/me')->assertOk()->json('data.metrics');
        $this->assertSame(5, $metrics['portfolio_total']);
        $this->assertSame(2, $metrics['portfolio_rented']);
        $this->assertSame(3, $metrics['portfolio_available']);
        $this->assertSame(2, $metrics['leases_active']);
        $this->assertSame(4, $metrics['bookings_pending']);
        $this->assertEquals(250_000.0, $metrics['expected_monthly']);
    }
}
