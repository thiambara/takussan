<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2579 (ADR-0102 § Conséquences) — la liste se découpe par nature (`filter[kind]`), et la
 * nature, l'auteur et la saisie pour le client se lisent sous un sparse fieldset.
 */
class BookingKindFilterTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_list_filters_by_kind_and_serves_the_author(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create(['first_name' => 'Fatou', 'last_name' => 'Sarr']);
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $customer = Customer::factory()->create(['agency_id' => $agency->id, 'user_id' => null]);

        $ids = [];
        foreach (BookingKind::cases() as $kind) {
            $ids[$kind->value] = Booking::factory()->create([
                'property_id' => $property->id,
                'agency_id' => $agency->id,
                'customer_id' => $customer->id,
                'created_by_id' => $agent->id,
                'kind' => $kind,
            ])->id;
        }

        Sanctum::actingAs($agent);

        $this->getJson('/api/bookings?filter[kind]=offer')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $ids['offer'])
            ->assertJsonPath('data.0.kind', 'offer')
            ->assertJsonPath('data.0.created_by', ['id' => $agent->id, 'name' => 'Fatou Sarr'])
            ->assertJsonPath('data.0.recorded_by_staff', true);

        $this->getJson('/api/bookings?filter[kind]=stay,application')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->getJson('/api/bookings?fields[bookings]=id,kind,offer_expires_at,list_price_at_booking&filter[kind]=application')
            ->assertOk()
            ->assertJsonPath('data.0.kind', 'application')
            ->assertJsonMissingPath('data.0.created_by')
            ->assertJsonMissingPath('data.0.recorded_by_staff');
    }
}
