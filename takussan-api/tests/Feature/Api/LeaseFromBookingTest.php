<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2894 (ADR-0110 § 10) — le bail créé depuis une candidature reprend, quand la requête ne les
 * envoie pas, le montant de la candidature (le loyer du bien à sa création, pas son loyer actuel),
 * sa caution, sa durée (la date de fin) et ses garants. Ce que la requête envoie l'emporte, et la
 * reprise d'un garant suit la règle du garant nommé (lisible par le créateur, de l'agence du bien).
 */
class LeaseFromBookingTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $bailleur;

    private Customer $customer;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-15 10:00:00');

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->withAgentProfile($this->agency)->create();
        $this->bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $this->customer = Customer::factory()->create([
            'agency_id' => $this->agency->id,
            'user_id' => User::factory()->create()->id,
            'added_by_id' => $this->bailleur->id,
        ]);
        $this->bien = Property::factory()->published()->create([
            'agency_id' => $this->agency->id, 'user_id' => $this->bailleur->id, 'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly,
            'price' => '300000', 'deposit_months' => 2,
        ]);
    }

    /** Une candidature saisie par l'agent quand le bien est à 300 000 F, avec un garant ; puis le bien passe à 320 000 F. */
    private function candidatureAvecGarant(): Booking
    {
        Sanctum::actingAs($this->agent);
        $id = $this->postJson('/api/bookings', [
            'kind' => 'application', 'property_id' => $this->bien->id,
            'customer_id' => $this->customer->id, 'start_date' => '2026-12-01', 'term_months' => 24,
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/bookings/{$id}/guarantors", [
            'first_name' => 'Ibrahima', 'last_name' => 'Dieng', 'relationship_to_tenant' => 'son frère',
        ])->assertCreated();

        $this->bien->update(['price' => '320000', 'deposit_months' => 3]);

        return Booking::query()->findOrFail($id);
    }

    /** @param  array<string, mixed>  $extra */
    private function bail(Booking $booking, array $extra = []): Lease
    {
        $id = $this->postJson('/api/leases', $extra + [
            'property_id' => $this->bien->id,
            'tenant_id' => $this->customer->id,
            'booking_id' => $booking->id,
            'type' => 'residential_rent',
            'start_date' => '2026-12-01',
        ])->assertCreated()->json('data.id');

        return Lease::query()->with('guarantors')->findOrFail($id);
    }

    public function test_ac3_le_bail_reprend_le_loyer_la_caution_la_duree_et_le_garant_de_la_candidature(): void
    {
        $booking = $this->candidatureAvecGarant();
        $garant = $booking->guarantors()->sole();
        $this->assertSame('600000.00', (string) $booking->security_deposit_amount);

        Sanctum::actingAs($this->agent);
        $lease = $this->bail($booking);

        $this->assertSame('300000.00', (string) $lease->monthly_rent);
        $this->assertSame('600000.00', (string) $lease->deposit_amount);
        $this->assertSame('2028-11-30', $lease->end_date->toDateString());
        $this->assertSame([$garant->id], $lease->guarantors->pluck('id')->all());
    }

    public function test_ce_que_la_requete_envoie_l_emporte_sur_la_reprise(): void
    {
        $booking = $this->candidatureAvecGarant();
        $autre = Guarantor::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id]);

        Sanctum::actingAs($this->agent);
        $lease = $this->bail($booking, [
            'monthly_rent' => 310000,
            'deposit_amount' => 0,
            'end_date' => '2027-11-30',
            'guarantor_id' => $autre->id,
        ]);

        $this->assertSame('310000.00', (string) $lease->monthly_rent);
        $this->assertSame('0.00', (string) $lease->deposit_amount);
        $this->assertSame('2027-11-30', $lease->end_date->toDateString());
        // Un garant nommé : les garants de la candidature ne sont pas rattachés.
        $this->assertSame([], $lease->guarantors->pluck('id')->all());
        $this->assertSame($autre->id, (int) $lease->guarantor_id);
    }

    public function test_un_loyer_ou_une_caution_envoyes_nuls_ne_sont_pas_remplaces(): void
    {
        $booking = $this->candidatureAvecGarant();

        Sanctum::actingAs($this->agent);
        $lease = $this->bail($booking, ['monthly_rent' => null, 'deposit_amount' => null]);

        $this->assertNull($lease->monthly_rent);
        $this->assertNull($lease->deposit_amount);
    }

    public function test_le_bailleur_ne_rattache_pas_un_garant_qu_il_ne_lit_pas(): void
    {
        $booking = $this->candidatureAvecGarant();
        $garant = $booking->guarantors()->sole();
        $this->assertFalse($this->bailleur->can('view', $garant));

        Sanctum::actingAs($this->bailleur);
        $lease = $this->bail($booking);

        $this->assertSame('300000.00', (string) $lease->monthly_rent);
        $this->assertSame([], $lease->guarantors->pluck('id')->all());
    }

    public function test_un_sejour_ne_reprend_rien(): void
    {
        $sejour = Booking::factory()->create([
            'property_id' => $this->bien->id, 'agency_id' => $this->agency->id, 'customer_id' => $this->customer->id,
            'kind' => BookingKind::Stay, 'status' => BookingStatus::Confirmed, 'total_amount' => 45000,
        ]);

        Sanctum::actingAs($this->agent);
        $lease = $this->bail($sejour);

        $this->assertNull($lease->monthly_rent);
        $this->assertNull($lease->deposit_amount);
        $this->assertNull($lease->end_date);
    }
}
