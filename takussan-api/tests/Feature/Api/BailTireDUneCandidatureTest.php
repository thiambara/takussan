<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * P48.03 (TCK-2352, décision du porteur du 2026-10-25) — le bail tiré d'une candidature.
 *
 * `StoreLeaseRequest` acceptait `booking_id`, borné au seul bien : rien ne vérifiait que le
 * locataire était le client de la réservation, et la réservation restait `confirmed`, ses nuits
 * bloquées pour toute autre confirmation (`PropertyAvailabilityService`). Désormais le locataire
 * est le client de la réservation, et la création du bail la passe à `completed`, ce qui libère
 * ses nuits.
 */
class BailTireDUneCandidatureTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private Property $bien;

    private Customer $candidat;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agence = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agence);
        $this->bien = Property::factory()->published()->create([
            'agency_id' => $this->agence->id,
            'visibility' => PropertyVisibility::Public,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => 250_000,
        ]);
        $this->candidat = Customer::factory()->create(['agency_id' => $this->agence->id]);
    }

    private function candidature(BookingStatus $status, ?Customer $client = null): Booking
    {
        return Booking::factory()->create([
            'property_id' => $this->bien->id,
            'agency_id' => $this->agence->id,
            'customer_id' => ($client ?? $this->candidat)->id,
            'status' => $status,
            'start_date' => now()->addDays(5)->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
        ]);
    }

    /** @return array<string, mixed> */
    private function bail(Booking $reservation, Customer $locataire): array
    {
        return [
            'property_id' => $this->bien->id,
            'tenant_id' => $locataire->id,
            'booking_id' => $reservation->id,
            'type' => 'residential_rent',
            'start_date' => now()->addDays(5)->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 250000,
            'deposit_amount' => 0,
        ];
    }

    public function test_le_bail_d_une_candidature_confirmee_la_termine_et_libere_ses_nuits(): void
    {
        $reservation = $this->candidature(BookingStatus::Confirmed);
        $autre = $this->candidature(BookingStatus::Pending, Customer::factory()->create(['agency_id' => $this->agence->id]));

        $id = $this->actingAsApi($this->agent)
            ->postJson('/api/leases', $this->bail($reservation, $this->candidat))
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($reservation->id, Lease::query()->findOrFail($id)->booking_id);
        $this->assertSame(BookingStatus::Completed, $reservation->refresh()->status);

        // Ses nuits ne bloquent plus : la candidature voisine, sur les mêmes dates, se confirme.
        $this->postJson("/api/bookings/{$autre->id}/confirm")->assertOk();
        $this->assertSame(BookingStatus::Confirmed, $autre->refresh()->status);
    }

    public function test_le_locataire_doit_etre_le_client_de_la_reservation(): void
    {
        $reservation = $this->candidature(BookingStatus::Confirmed);
        $autreFiche = Customer::factory()->create(['agency_id' => $this->agence->id]);

        $this->actingAsApi($this->agent)
            ->postJson('/api/leases', $this->bail($reservation, $autreFiche))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['tenant_id']);

        $this->assertSame(0, Lease::query()->count());
        $this->assertSame(BookingStatus::Confirmed, $reservation->refresh()->status);
    }

    public function test_une_candidature_en_attente_se_termine_aussi(): void
    {
        $reservation = $this->candidature(BookingStatus::Pending);

        $this->actingAsApi($this->agent)
            ->postJson('/api/leases', $this->bail($reservation, $this->candidat))
            ->assertCreated();

        $this->assertSame(BookingStatus::Completed, $reservation->refresh()->status);
    }

    /** Témoin : une réservation déjà close garde son statut ; le bail s'y rattache comme avant. */
    public function test_temoin_une_reservation_close_garde_son_statut(): void
    {
        $reservation = $this->candidature(BookingStatus::Cancelled);

        $this->actingAsApi($this->agent)
            ->postJson('/api/leases', $this->bail($reservation, $this->candidat))
            ->assertCreated();

        $this->assertSame(BookingStatus::Cancelled, $reservation->refresh()->status);
    }

    /** Témoin : sans réservation, rien ne change. */
    public function test_temoin_sans_reservation_rien_ne_change(): void
    {
        $reservation = $this->candidature(BookingStatus::Confirmed);
        $donnees = $this->bail($reservation, $this->candidat);
        unset($donnees['booking_id']);

        $this->actingAsApi($this->agent)->postJson('/api/leases', $donnees)->assertCreated();

        $this->assertSame(BookingStatus::Confirmed, $reservation->refresh()->status);
    }
}
