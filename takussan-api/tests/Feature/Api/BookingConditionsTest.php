<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\OfferFinancing;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2870 (ADR-0110 § 1) — une candidature porte sa durée, sa caution et ce qu'il faut verser à
 * l'entrée ; une offre son financement, son délai de signature et ses conditions.
 *
 * - une nature n'écrit QUE ses champs : un champ d'une autre nature rend 422
 *   `booking.field_not_for_kind`, et les colonnes de l'autre nature restent nulles ;
 * - la caution, l'avance et les frais sont un INSTANTANÉ du bien à la création ;
 * - `entry_amount` = loyer × max(1, avance) + caution + loyer × frais, dérivé, jamais écrit.
 */
class BookingConditionsTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    private Customer $customer;

    private Property $monthly;

    private Property $sale;

    private Property $daily;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');

        $agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($agency)->create();
        $this->customer = Customer::factory()->create(['agency_id' => $agency->id, 'user_id' => null]);
        $commun = ['agency_id' => $agency->id, 'currency' => Currency::XOF];
        $this->monthly = Property::factory()->published()->create($commun + [
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly, 'price' => '300000',
            'deposit_months' => 2, 'advance_months' => 1, 'agency_fee_months' => null,
        ]);
        $this->sale = Property::factory()->published()->create($commun + [
            'contract_type' => ContractType::Sale, 'rent_period' => null, 'price' => '95000000',
        ]);
        $this->daily = Property::factory()->published()->create($commun + [
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Daily, 'price' => '20000',
        ]);
    }

    /** @param  array<string, mixed>  $extra */
    private function application(array $extra = []): TestResponse
    {
        Sanctum::actingAs($this->agent);

        return $this->postJson('/api/bookings', array_merge([
            'kind' => 'application', 'property_id' => $this->monthly->id,
            'customer_id' => $this->customer->id, 'start_date' => '2026-12-01',
        ], $extra));
    }

    /** @param  array<string, mixed>  $extra */
    private function offer(array $extra = []): TestResponse
    {
        Sanctum::actingAs($this->agent);

        return $this->postJson('/api/bookings', array_merge([
            'kind' => 'offer', 'property_id' => $this->sale->id,
            'customer_id' => $this->customer->id, 'total_amount' => 85000000,
        ], $extra));
    }

    public function test_ac1_an_application_snapshots_the_deposit_and_derives_the_entry_amount(): void
    {
        $id = $this->application()
            ->assertCreated()
            ->assertJsonPath('data.term_months', 12)
            ->assertJsonPath('data.renewable', true)
            ->assertJsonPath('data.security_deposit_months', 2)
            ->assertJsonPath('data.security_deposit_amount', 600000)
            ->assertJsonPath('data.entry_amount', 900000)
            ->json('data.id');

        // Le bien change ensuite : la candidature garde ce qu'on lui a montré.
        $this->monthly->update(['deposit_months' => 3, 'advance_months' => 2, 'agency_fee_months' => 1, 'price' => '400000']);

        $this->getJson("/api/bookings/{$id}")
            ->assertOk()
            ->assertJsonPath('data.security_deposit_amount', 600000)
            ->assertJsonPath('data.security_deposit_months', 2)
            ->assertJsonPath('data.term_months', 12)
            ->assertJsonPath('data.entry_amount', 900000);
        $this->assertSame('600000.00', Booking::query()->sole()->security_deposit_amount);
    }

    public function test_the_entry_amount_counts_the_advance_and_the_agency_fee(): void
    {
        $this->monthly->update(['deposit_months' => 2, 'advance_months' => 3, 'agency_fee_months' => '0.5']);

        // 300 000 × 3 + 600 000 + 300 000 × 0,5 = 1 650 000 ; la durée et le renouvellement saisis.
        $this->application(['term_months' => 24, 'renewable' => false])
            ->assertCreated()
            ->assertJsonPath('data.term_months', 24)
            ->assertJsonPath('data.renewable', false)
            ->assertJsonPath('data.advance_months_at_booking', 3)
            ->assertJsonPath('data.agency_fee_months_at_booking', 0.5)
            ->assertJsonPath('data.entry_amount', 1650000);
    }

    public function test_the_deposit_follows_the_amount_of_the_application_not_the_list_price(): void
    {
        $this->application(['total_amount' => 280000])
            ->assertCreated()
            ->assertJsonPath('data.security_deposit_amount', 560000)
            ->assertJsonPath('data.entry_amount', 840000);
    }

    public function test_ac2_an_offer_keeps_its_financing_its_deadline_and_its_conditions(): void
    {
        $this->offer(['financing' => 'cash', 'signature_within_days' => 30, 'conditions' => 'Aucune'])
            ->assertCreated()
            ->assertJsonPath('data.financing', 'cash')
            ->assertJsonPath('data.signature_within_days', 30)
            ->assertJsonPath('data.conditions', 'Aucune')
            ->assertJsonPath('data.entry_amount', null);

        $booking = Booking::query()->sole();
        $this->assertSame(OfferFinancing::Cash, $booking->financing);
        // Une offre n'écrit pas les colonnes d'une candidature.
        foreach (['term_months', 'renewable', 'security_deposit_months', 'security_deposit_amount', 'advance_months_at_booking', 'agency_fee_months_at_booking'] as $colonne) {
            $this->assertNull($booking->{$colonne}, $colonne);
        }
    }

    public function test_ac2_a_field_of_another_kind_is_refused_not_ignored(): void
    {
        $this->offer(['financing' => 'cash', 'signature_within_days' => 30, 'conditions' => 'Aucune', 'term_months' => 12])
            ->assertStatus(422)->assertJsonPath('code', 'booking.field_not_for_kind');
        $this->application(['financing' => 'cash'])
            ->assertStatus(422)->assertJsonPath('code', 'booking.field_not_for_kind');
        $this->application(['conditions' => 'Sous réserve'])
            ->assertStatus(422)->assertJsonPath('code', 'booking.field_not_for_kind');

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_an_application_does_not_write_the_columns_of_an_offer(): void
    {
        $this->application()->assertCreated();

        $booking = Booking::query()->sole();
        $this->assertNull($booking->financing);
        $this->assertNull($booking->signature_within_days);
        $this->assertNull($booking->conditions);
    }

    public function test_the_bounds_of_each_condition(): void
    {
        $this->application(['term_months' => 0])->assertStatus(422)->assertJsonValidationErrors(['term_months']);
        $this->application(['term_months' => 121])->assertStatus(422)->assertJsonValidationErrors(['term_months']);
        $this->offer(['financing' => 'leasing'])->assertStatus(422)->assertJsonValidationErrors(['financing']);
        $this->offer(['signature_within_days' => 366])->assertStatus(422)->assertJsonValidationErrors(['signature_within_days']);
        $this->offer(['conditions' => str_repeat('a', 501)])->assertStatus(422)->assertJsonValidationErrors(['conditions']);

        $this->assertDatabaseCount('bookings', 0);
    }

    public function test_the_public_tunnel_writes_the_conditions_of_the_kind(): void
    {
        $client = User::factory()->create();
        Sanctum::actingAs($client);

        $this->postJson("/api/public/properties/{$this->sale->slug}/booking-request", [
            'offer_amount' => 85000000, 'offer_expires_at' => '2026-11-21', 'terms_accepted' => true,
            'financing' => 'mortgage', 'signature_within_days' => 60, 'conditions' => 'Sous réserve du prêt',
        ])->assertCreated()->assertJsonPath('data.financing', 'mortgage')->assertJsonPath('data.signature_within_days', 60);

        $this->postJson("/api/public/properties/{$this->monthly->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2027-12-01', 'guests' => 2, 'term_months' => 6,
        ])->assertCreated()
            ->assertJsonPath('data.kind', 'application')
            ->assertJsonPath('data.term_months', 6)
            ->assertJsonPath('data.renewable', true)
            ->assertJsonPath('data.security_deposit_amount', 600000)
            ->assertJsonPath('data.entry_amount', 900000);

        $this->assertSame(2, Booking::query()->count());
    }

    public function test_the_public_tunnel_refuses_a_field_of_another_kind(): void
    {
        $client = User::factory()->create();
        Sanctum::actingAs($client);

        $this->postJson("/api/public/properties/{$this->sale->slug}/booking-request", [
            'offer_amount' => 85000000, 'offer_expires_at' => '2026-11-21', 'terms_accepted' => true, 'term_months' => 12,
        ])->assertStatus(422)->assertJsonPath('code', 'booking.field_not_for_kind');
        $this->postJson("/api/public/properties/{$this->monthly->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2027-12-01', 'guests' => 2, 'financing' => 'cash',
        ])->assertStatus(422)->assertJsonPath('code', 'booking.field_not_for_kind');
        // Un séjour n'a aucune condition, pas même la durée d'une candidature.
        $this->postJson("/api/public/properties/{$this->daily->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2026-12-03', 'guests' => 2, 'term_months' => 12,
        ])->assertStatus(422)->assertJsonPath('code', 'booking.field_not_for_kind');

        $this->assertDatabaseCount('bookings', 0);
        $this->assertDatabaseCount('customers', 1);
    }

    public function test_a_stay_writes_no_condition(): void
    {
        $client = User::factory()->create();
        Sanctum::actingAs($client);

        $this->postJson("/api/public/properties/{$this->daily->slug}/booking-request", [
            'start_date' => '2026-12-01', 'end_date' => '2026-12-03', 'guests' => 2,
        ])->assertCreated()->assertJsonPath('data.kind', 'stay')->assertJsonPath('data.term_months', null);

        $booking = Booking::query()->sole();
        $this->assertSame(BookingKind::Stay, $booking->kind);
        foreach (['term_months', 'renewable', 'security_deposit_months', 'security_deposit_amount', 'advance_months_at_booking', 'agency_fee_months_at_booking', 'financing', 'signature_within_days', 'conditions'] as $colonne) {
            $this->assertNull($booking->{$colonne}, $colonne);
        }
    }
}
