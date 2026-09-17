<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-530, vérification adverse — `POST /api/bookings` par un membre d'agence.
 *
 * `BookingService::create()` laissait un membre de l'agence du bien (`$isStaff`) passer
 * N'IMPORTE QUEL `customer_id` existant : un agent de l'agence A réservait au nom d'un client de
 * l'agence B, et la réservation (avec les coordonnées du client) entrait dans le périmètre de A.
 * Le client doit être lisible par l'émetteur (`CustomerPolicy::view` : son agence active, ou un
 * client qu'il a ajouté), ou être l'émetteur lui-même.
 */
class BookingCustomerScopeTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agencyA;

    private User $agentA;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agencyA = Agency::factory()->create();
        $this->agentA = User::factory()->withAgentProfile($this->agencyA)->create();
        $this->property = Property::factory()->create([
            'agency_id' => $this->agencyA->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
            'price' => '20000',
        ]);
        Sanctum::actingAs($this->agentA);
    }

    private function bookFor(Customer $customer)
    {
        return $this->postJson('/api/bookings', [
            'property_id' => $this->property->id,
            'customer_id' => $customer->id,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ]);
    }

    public function test_an_agent_cannot_book_for_a_customer_of_another_agency(): void
    {
        $customerOfB = Customer::factory()->create(['agency_id' => Agency::factory()->create()->id]);

        $this->bookFor($customerOfB)->assertForbidden();

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_an_agent_books_for_a_customer_of_their_agency(): void
    {
        $customerOfA = Customer::factory()->create(['agency_id' => $this->agencyA->id]);

        $this->bookFor($customerOfA)->assertCreated();

        $this->assertSame($customerOfA->id, Booking::query()->sole()->customer_id);
    }

    public function test_an_agent_books_for_a_customer_they_added(): void
    {
        $added = Customer::factory()->create(['agency_id' => null, 'added_by_id' => $this->agentA->id]);

        $this->bookFor($added)->assertCreated();
    }
}
