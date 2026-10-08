<?php

namespace Tests\Feature\Calendar;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-591 — tâches, échéances de bail et interventions dans l'agenda (AC8, AC9, AC27 côté API).
 */
class CalendarNewTypesTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id, 'title' => 'Villa Ngor']);
    }

    private function uri(array $types, bool $mine = false, int $days = 30): string
    {
        $query = collect($types)->map(fn ($t) => 'types[]='.$t)->implode('&');

        return '/api/calendar?start_date='.now()->toDateString()
            .'&end_date='.now()->addDays($days)->toDateString()
            .'&'.$query.($mine ? '&mine=1' : '');
    }

    /** AC8 */
    public function test_tasks_lease_events_and_maintenance_for_an_agent(): void
    {
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id]);
        $mine = Task::factory()->forCustomer($customer)->create([
            'created_by_id' => $this->agent->id,
            'assigned_to_id' => $this->agent->id,
            'due_at' => now()->addDays(3),
        ]);
        // La tâche d'un collègue n'est pas la mienne.
        $colleague = User::factory()->create();
        $this->materializeRoleProfile($colleague, 'agent', $this->agency);
        Task::factory()->forCustomer($customer)->create([
            'created_by_id' => $colleague->id,
            'assigned_to_id' => $colleague->id,
            'due_at' => now()->addDays(3),
        ]);

        $lease = Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'status' => LeaseStatus::Active,
            'start_date' => now()->subYear()->toDateString(),
            'end_date' => now()->addDays(10)->toDateString(),
            'renewal_date' => now()->addDays(5)->toDateString(),
        ]);
        // Hors fenêtre : ni fin ni renouvellement dans les 30 jours.
        Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'status' => LeaseStatus::Active,
            'end_date' => now()->addYear()->toDateString(),
        ]);

        $maintenance = MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'assigned_to' => $this->agent->id,
            'status' => MaintenanceStatus::Assigned,
            'scheduled_at' => now()->addDays(4),
        ]);

        $events = collect($this->actingAsApi($this->agent)
            ->apiGet($this->uri(['task', 'lease_event', 'maintenance'], mine: true))
            ->assertOk()
            ->json('data'));

        $this->assertSame(
            ["lease_event-{$lease->id}-end", "lease_event-{$lease->id}-renewal", "maintenance-{$maintenance->id}", "task-{$mine->id}"],
            $events->pluck('key')->sort()->values()->all(),
        );
        $this->assertSame('Villa Ngor', $events->firstWhere('type', 'maintenance')['title']);
    }

    public function test_a_window_of_more_than_186_days_is_refused(): void
    {
        $this->actingAsApi($this->agent)->apiGet($this->uri(['task'], days: 200))->assertStatus(422);
        $this->actingAsApi($this->agent)->apiGet($this->uri(['task'], days: 186))->assertOk();
    }

    /** AC9 + AC27 — le prestataire voit SES interventions, aucune autre, et rien d'autre. */
    public function test_a_service_provider_sees_only_his_scheduled_interventions(): void
    {
        $provider = User::factory()->create();
        ServiceProviderProfile::factory()->create(['user_id' => $provider->id]);

        $his = MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'assigned_to' => $provider->id,
            'status' => MaintenanceStatus::Assigned,
            'scheduled_at' => now()->addDays(2),
        ]);
        MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'assigned_to' => User::factory()->create()->id,
            'status' => MaintenanceStatus::Assigned,
            'scheduled_at' => now()->addDays(2),
        ]);
        Booking::factory()->create([
            'property_id' => $this->property->id,
            'customer_id' => Customer::factory()->create()->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(2)->toDateString(),
        ]);
        PropertyVisit::factory()->create([
            'property_id' => $this->property->id,
            'visitor_id' => User::factory()->create()->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => now()->addDays(2),
        ]);

        $this->actingAsApi($provider)->apiGet($this->uri(['maintenance']))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.key', "maintenance-{$his->id}");

        $this->actingAsApi($provider)->apiGet($this->uri(['booking', 'visit']))
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
}
