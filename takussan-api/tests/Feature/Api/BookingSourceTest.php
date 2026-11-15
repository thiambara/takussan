<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingSource;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2874 (ADR-0110 § 6) — l'origine d'une réservation : `invitation` quand le tunnel public a été
 * ouvert par le lien d'invitation (`via=invitation`, un INDICE sans droit), `public` sans, `staff`
 * quand le personnel la saisit — quoi qu'il envoie.
 */
class BookingSourceTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $client;

    private Property $monthly;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->client = User::factory()->create();
        $this->monthly = Property::factory()->published()->create([
            'agency_id' => $this->agency->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
        ]);
    }

    /** @param  array<string, mixed>  $extra */
    private function candidater(array $extra = []): TestResponse
    {
        Sanctum::actingAs($this->client);

        return $this->postJson("/api/public/properties/{$this->monthly->slug}/booking-request", $extra + [
            'start_date' => '2026-12-01', 'end_date' => '2027-12-01', 'guests' => 1,
        ]);
    }

    public function test_ac1_a_tunnel_application_opened_by_the_invitation_link_is_invitation(): void
    {
        $this->candidater(['via' => 'invitation'])->assertCreated()->assertJsonPath('data.source', 'invitation');

        $this->assertSame(BookingSource::Invitation, Booking::query()->sole()->source);
    }

    public function test_ac1_a_tunnel_application_without_the_hint_is_public(): void
    {
        $this->candidater()->assertCreated()->assertJsonPath('data.source', 'public');

        $this->assertSame(BookingSource::Public, Booking::query()->sole()->source);
    }

    public function test_a_public_offer_carries_the_hint_too(): void
    {
        $sale = Property::factory()->published()->create([
            'agency_id' => $this->agency->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Sale, 'rent_period' => null, 'price' => '95000000',
        ]);
        Sanctum::actingAs($this->client);

        $this->postJson("/api/public/properties/{$sale->slug}/booking-request", [
            'offer_amount' => 85000000, 'offer_expires_at' => '2026-11-25', 'terms_accepted' => true, 'via' => 'invitation',
        ])->assertCreated()->assertJsonPath('data.source', 'invitation');
    }

    public function test_an_unknown_hint_is_refused_not_ignored(): void
    {
        $this->candidater(['via' => 'staff'])->assertUnprocessable()->assertJsonValidationErrors('via');

        $this->assertSame(0, Booking::query()->count());
    }

    public function test_ac1_recorded_by_the_agent_is_staff_even_with_the_hint(): void
    {
        $customer = Customer::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->client->id]);
        Sanctum::actingAs($this->agent);

        $this->postJson('/api/bookings', [
            'kind' => 'application', 'property_id' => $this->monthly->id,
            'customer_id' => $customer->id, 'start_date' => '2026-12-01', 'via' => 'invitation',
        ])->assertCreated()->assertJsonPath('data.source', 'staff');

        $this->assertSame(BookingSource::Staff, Booking::query()->sole()->source);
    }

    public function test_the_source_is_a_sparse_field(): void
    {
        $this->candidater(['via' => 'invitation'])->assertCreated();
        Sanctum::actingAs($this->client);

        $this->getJson('/api/bookings?fields[bookings]=id,source')
            ->assertOk()
            ->assertJsonPath('data.0.source', 'invitation');
    }
}
