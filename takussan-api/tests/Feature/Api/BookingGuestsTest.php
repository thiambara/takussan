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
 * TCK-1065 (P80.02) — le tunnel de réservation exige le nombre de voyageurs et l'envoie à
 * `POST /api/bookings`, dont `StoreBookingRequest` n'avait pas de règle `guests` : le nombre était
 * écarté par `validated()`. Il est désormais rangé dans `metadata.guests`, comme le fait déjà la
 * demande publique (`PublicPropertyController::bookingRequest()`).
 */
class BookingGuestsTest extends TestCase
{
    use RefreshDatabase;

    private Property $property;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $this->property = Property::factory()->create([
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
            'price' => '20000',
        ]);
        $this->customer = Customer::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($agent);
    }

    /** @param  array<string, mixed>  $extra */
    private function book(array $extra = [])
    {
        return $this->postJson('/api/bookings', [
            'property_id' => $this->property->id,
            'customer_id' => $this->customer->id,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ] + $extra);
    }

    public function test_le_nombre_de_voyageurs_est_enregistre(): void
    {
        $this->book(['guests' => 3])->assertCreated();

        $this->assertSame(['guests' => 3], Booking::query()->sole()->metadata);
    }

    public function test_sans_voyageurs_les_metadonnees_restent_vides(): void
    {
        $this->book()->assertCreated();

        $this->assertNull(Booking::query()->sole()->metadata);
    }

    public function test_un_nombre_hors_borne_est_refuse(): void
    {
        $this->book(['guests' => 21])->assertUnprocessable()->assertJsonValidationErrors('guests');
        $this->book(['guests' => 0])->assertUnprocessable()->assertJsonValidationErrors('guests');

        $this->assertDatabaseCount('bookings', 0);
    }
}
