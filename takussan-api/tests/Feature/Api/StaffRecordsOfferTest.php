<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2579 (ADR-0102 §3) — le personnel enregistre une OFFRE d'achat au montant que le client
 * propose. Avant : le total d'une vente était forcé au prix affiché, et un autre montant refusé
 * (`amount_mismatch`, `BookingService::pricedAmounts`).
 */
class StaffRecordsOfferTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    private Property $sale;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');

        $agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($agency)->create();
        $this->sale = Property::factory()->published()->create([
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Sale,
            'rent_period' => null,
            'price' => '95000000',
            'currency' => Currency::XOF,
        ]);
        $this->customer = Customer::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($this->agent);
    }

    /** @param  array<string, mixed>  $extra */
    private function offer(array $extra = []): TestResponse
    {
        return $this->postJson('/api/bookings', array_merge([
            'kind' => 'offer',
            'property_id' => $this->sale->id,
            'customer_id' => $this->customer->id,
            'total_amount' => 85000000,
        ], $extra));
    }

    public function test_an_offer_keeps_the_offered_amount_and_the_listed_price(): void
    {
        $this->offer()
            ->assertCreated()
            ->assertJsonPath('data.kind', 'offer')
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.total_amount', 85000000)
            ->assertJsonPath('data.list_price_at_booking', 95000000)
            ->assertJsonPath('data.start_date', null)
            ->assertJsonPath('data.end_date', null);

        $booking = Booking::query()->sole();
        $this->assertSame(BookingKind::Offer, $booking->kind);
        $this->assertSame('85000000.00', $booking->total_amount);
        $this->assertSame('95000000.00', $booking->list_price_at_booking);
        $this->assertNull($booking->deposit_amount);
        $this->assertSame('2026-11-18', $booking->expires_at->toDateString(), 'sans validité : 7 jours, comme avant');
    }

    public function test_the_validity_ends_at_the_end_of_that_day_in_dakar(): void
    {
        $this->offer(['offer_expires_at' => '2026-11-21'])
            ->assertCreated()
            ->assertJsonPath('data.offer_expires_at', '2026-11-21');

        $booking = Booking::query()->sole();
        $this->assertSame('2026-11-21', $booking->offer_expires_at->toDateString());
        $this->assertSame('2026-11-21 23:59:59', $booking->expires_at->copy()->setTimezone('Africa/Dakar')->format('Y-m-d H:i:s'));
    }

    public function test_an_offer_says_its_amount_and_it_fits_the_column(): void
    {
        $this->offer(['total_amount' => null])->assertStatus(422)->assertJsonValidationErrors(['total_amount']);
        $this->offer(['total_amount' => 0])->assertStatus(422)->assertJsonValidationErrors(['total_amount']);
        $this->offer(['total_amount' => '1000000000000.00'])->assertStatus(422)->assertJsonValidationErrors(['total_amount']);
        $this->offer(['start_date' => '2026-12-01'])->assertStatus(422)->assertJsonValidationErrors(['start_date']);
        $this->offer(['deposit_amount' => 1000])->assertStatus(422)->assertJsonValidationErrors(['deposit_amount']);
        $this->offer(['currency' => 'EUR'])->assertStatus(422)->assertJsonValidationErrors(['currency']);
        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_validity_belongs_to_an_offer_only(): void
    {
        $this->postJson('/api/bookings', [
            'property_id' => $this->sale->id,
            'customer_id' => $this->customer->id,
            'offer_expires_at' => '2026-11-21',
        ])->assertStatus(422)->assertJsonValidationErrors(['offer_expires_at']);
    }

    /** Sans `kind`, la règle d'avant : le prix affiché, et un autre montant refusé — mais la nature est posée. */
    public function test_without_a_kind_a_sale_keeps_the_previous_rule_and_is_an_offer(): void
    {
        $this->postJson('/api/bookings', [
            'property_id' => $this->sale->id,
            'customer_id' => $this->customer->id,
            'total_amount' => 85000000,
        ])->assertStatus(422)->assertJsonValidationErrors(['total_amount']);

        $this->postJson('/api/bookings', [
            'property_id' => $this->sale->id,
            'customer_id' => $this->customer->id,
        ])->assertCreated()->assertJsonPath('data.kind', 'offer')->assertJsonPath('data.total_amount', 95000000);
    }

    /**
     * TCK-2743 (lot 3) — une validité donnée en INSTANT (avec décalage) est l'instant qu'elle désigne ;
     * `FinInclusive` le rendait tel quel et le cast en écrivait l'heure murale. La date seule garde sa
     * fin de jour (test précédent).
     */
    public function test_une_validite_donnee_en_instant_avec_decalage_est_l_instant_designe(): void
    {
        $this->offer(['offer_expires_at' => '2026-11-21T18:00:00+01:00'])->assertCreated();

        $this->assertSame('2026-11-21 17:00:00', Booking::query()->sole()->getRawOriginal('expires_at'));
    }

    /** TCK-2743 (lot 3) — sans validité, l'échéance envoyée avec décalage : l'instant désigné. */
    public function test_une_echeance_recue_avec_decalage_sans_validite_est_l_instant_designe(): void
    {
        $this->offer(['expires_at' => '2026-11-20T11:00:00+01:00'])->assertCreated();

        $this->assertSame('2026-11-20 10:00:00', Booking::query()->sole()->getRawOriginal('expires_at'));
    }
}
