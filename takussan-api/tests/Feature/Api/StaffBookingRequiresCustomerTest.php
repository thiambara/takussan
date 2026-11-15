<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2579 (ADR-0102 §2) — une réservation saisie par le personnel a TOUJOURS un client, quelle
 * que soit sa nature. Avant : un membre du personnel qui omettait `customer_id` créait une
 * réservation sans client (branche `elseif (! $isStaff)` de `BookingService::create`).
 */
class StaffBookingRequiresCustomerTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        Sanctum::actingAs($this->agent);
    }

    private function property(RentPeriod $period): Property
    {
        return Property::factory()->published()->create([
            'agency_id' => $this->agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => $period,
            'price' => '20000',
        ]);
    }

    public function test_an_application_without_a_customer_is_refused_and_creates_nothing(): void
    {
        $this->postJson('/api/bookings', [
            'kind' => 'application',
            'property_id' => $this->property(RentPeriod::Monthly)->id,
            'start_date' => '2026-12-01',
        ])->assertStatus(422)->assertJsonPath('code', 'booking.customer_required');

        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('customers', 0);
    }

    public function test_a_stay_recorded_by_staff_without_a_customer_is_refused_too(): void
    {
        $this->postJson('/api/bookings', [
            'property_id' => $this->property(RentPeriod::Daily)->id,
            'start_date' => '2026-12-01',
            'end_date' => '2026-12-03',
        ])->assertStatus(422)->assertJsonPath('code', 'booking.customer_required');

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_with_a_customer_the_stay_is_created_as_before(): void
    {
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id]);

        $this->postJson('/api/bookings', [
            'property_id' => $this->property(RentPeriod::Daily)->id,
            'customer_id' => $customer->id,
            'start_date' => '2026-12-01',
            'end_date' => '2026-12-03',
        ])->assertCreated()->assertJsonPath('data.kind', 'stay')->assertJsonPath('data.total_amount', 40000);
    }
}
