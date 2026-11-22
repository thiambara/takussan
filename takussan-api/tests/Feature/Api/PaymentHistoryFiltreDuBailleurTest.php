<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2651 — l'onglet « Opérations » du bailleur lit `GET /api/payments/history?filter[landlord_id]=<lui>`.
 * Ce filtre ne fait que RESTREINDRE : le périmètre de lecture est jugé par l'API (`BailleurDuBien::restreindre`
 * sur le bail, le bien sur la réservation), jamais par lui. Un `landlord_id` d'un autre bailleur — de la
 * même agence — ne rend donc rien, ni ligne ni total.
 */
class PaymentHistoryFiltreDuBailleurTest extends TestCase
{
    use RefreshDatabase;

    private User $bailleurA;

    private User $bailleurB;

    protected function setUp(): void
    {
        parent::setUp();
        $agence = Agency::factory()->create();
        $this->bailleurA = User::factory()->create();
        $this->bailleurB = User::factory()->create();
        $this->loyerEtReservation($agence, $this->bailleurA, 100_000);
        $this->loyerEtReservation($agence, $this->bailleurB, 700_000);
    }

    private function loyerEtReservation(Agency $agence, User $bailleur, int $montant): void
    {
        // Bailleur de l'agence : un profil propriétaire, sans quoi `BailleurDuBien` ne le reconnaît pas.
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id]);
        $bien = Property::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agence->id]);
        $locataire = Customer::factory()->create(['agency_id' => $agence->id]);
        $bail = Lease::factory()->create([
            'property_id' => $bien->id,
            'landlord_id' => $bailleur->id,
            'agency_id' => $agence->id,
            'tenant_id' => $locataire->id,
            'status' => LeaseStatus::Active,
        ]);
        LeasePayment::factory()->create(['lease_id' => $bail->id, 'payer_id' => $locataire->id, 'amount' => $montant]);
        $reservation = Booking::factory()->create([
            'property_id' => $bien->id,
            'agency_id' => $agence->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $agence->id])->id,
        ]);
        BookingPayment::factory()->paid()->create(['booking_id' => $reservation->id, 'amount' => $montant]);
    }

    public function test_le_landlord_id_d_un_autre_bailleur_ne_rend_rien(): void
    {
        Sanctum::actingAs($this->bailleurA);

        $this->getJson("/api/payments/history?per_page=100&filter[landlord_id]={$this->bailleurB->id}")
            ->assertOk()
            ->assertJsonPath('meta.total', 0)
            ->assertJsonCount(0, 'data');
    }

    public function test_son_propre_landlord_id_rend_ses_seules_operations(): void
    {
        Sanctum::actingAs($this->bailleurA);

        $reponse = $this->getJson("/api/payments/history?per_page=100&filter[landlord_id]={$this->bailleurA->id}")
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
        $this->assertEqualsWithDelta(200_000, (float) $reponse->json('meta.totals.amount'), 0.001);
    }
}
