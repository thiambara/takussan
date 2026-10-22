<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\TaskPriority;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\VisitStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * P127.05 (TCK-1361) — les tâches, visites et interventions du tableau de bord de l'agent sont
 * bornées à l'agence active par leur parent (bien, client, ou réservation pour une tâche de
 * remboursement), comme les clients et les baux du même tableau (décision du porteur, 2026-10-22).
 * Un agent de l'agence A voyait, à côté des chiffres de A, une tâche sur un client de l'agence B.
 */
class DashboardAgentAgencyBoundTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return array{task_customer: Task, task_booking: Task, customer: Customer} */
    private function seedAgency(Agency $agency, User $agent): array
    {
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id]);
        $task = fn (string $type, int $id, ?string $due) => Task::create([
            'title' => 'Tâche '.$agency->id,
            'taskable_type' => $type,
            'taskable_id' => $id,
            'assigned_to_id' => $agent->id,
            'created_by_id' => $agent->id,
            'status' => TaskStatus::Open,
            'priority' => TaskPriority::High,
            'due_at' => $due,
        ]);

        $taskCustomer = $task(Customer::class, $customer->id, '2026-07-10 10:00:00');
        $taskBooking = $task((new Booking)->getMorphClass(), $booking->id, '2026-07-20 10:00:00');

        foreach (['2026-07-15 18:00:00', '2026-07-17 10:00:00'] as $at) {
            PropertyVisit::factory()->create([
                'property_id' => $property->id,
                'agent_id' => $agent->id,
                'status' => VisitStatus::Scheduled,
                'scheduled_at' => $at,
            ]);
        }
        MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'assigned_to' => $agent->id,
            'status' => MaintenanceStatus::Assigned,
        ]);

        return ['task_customer' => $taskCustomer, 'task_booking' => $taskBooking, 'customer' => $customer];
    }

    public function test_tasks_visits_and_maintenance_of_another_agency_stay_out_of_the_agent_dashboard(): void
    {
        Carbon::setTestNow('2026-07-15 09:00:00');
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $agent = $this->apiActingAsRole('agent', ['agency' => $agencyA]);

        $a = $this->seedAgency($agencyA, $agent);
        $this->seedAgency($agencyB, $agent);

        $data = $this->apiGet('/api/dashboard/agent')->assertOk()->json('data');

        $this->assertSame($agencyA->id, $data['agency_id']);
        $this->assertSame(2, $data['tasks']['open']);
        $this->assertSame(1, $data['tasks']['overdue']);
        $this->assertEqualsCanonicalizing(
            [$a['task_customer']->id, $a['task_booking']->id],
            array_column($data['tasks']['items'], 'id'),
        );
        $this->assertEqualsCanonicalizing(
            [$a['task_customer']->id, $a['task_booking']->id],
            array_column($data['recent_activity'], 'id'),
        );
        $this->assertSame(2, $data['visits']['upcoming_7d']);
        $this->assertSame(1, $data['visits']['today']);
        $this->assertCount(1, $data['visits']['today_items']);
        $this->assertSame(1, $data['maintenance']['open']);
    }
}
