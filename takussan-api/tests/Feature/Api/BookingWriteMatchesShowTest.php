<?php

namespace Tests\Feature\Api;

use App\Models\Address;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FormeDuShow;
use Tests\TestCase;

/**
 * ADR-0071 (TCK-1509, P95.03) — `store`, `confirm`, `cancel` et `reject` d'une réservation rendent
 * la forme de son `show` : `property` (avec son adresse, rendue en `location`), `customer`, `refund_status`,
 * `booking_payments` et `can_refund`. Avant : les trois gestes rendaient la ressource nue, et
 * `store` chargeait le bien sans adresse. Chaque écriture est relue par le `show` du même appelant.
 */
class BookingWriteMatchesShowTest extends TestCase
{
    use FormeDuShow;
    use RefreshDatabase;

    private User $bailleur;

    private User $client;

    private Property $bien;

    private Customer $fiche;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->bailleur = User::factory()->create();
        $this->client = User::factory()->create();
        $this->fiche = Customer::factory()->create(['user_id' => $this->client->id]);
        $this->bien = Property::factory()->create([
            'user_id' => $this->bailleur->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
        ]);
        Address::factory()->create([
            'addressable_type' => $this->bien->getMorphClass(),
            'addressable_id' => $this->bien->id,
            'city' => 'Dakar',
            'neighborhood' => 'Mermoz',
        ]);
    }

    public function test_la_creation_rend_la_forme_du_show(): void
    {
        Sanctum::actingAs($this->client);

        $ecriture = $this->postJson('/api/bookings', [
            'property_id' => $this->bien->id,
            'customer_id' => $this->fiche->id,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(5)->toDateString(),
        ])->assertCreated()->json('data');

        $this->assertEcritureALaFormeDuShow($ecriture, $this->show($ecriture['id'], avecPaiement: false), geste: 'store');
    }

    public function test_confirmer_rend_la_forme_du_show(): void
    {
        $reservation = $this->reservationEnAttente();
        Sanctum::actingAs($this->bailleur);

        $ecriture = $this->postJson("/api/bookings/{$reservation->id}/confirm")->assertOk()->json('data');

        $this->assertEcritureALaFormeDuShow($ecriture, $this->show($reservation->id), geste: 'confirm');
    }

    public function test_annuler_rend_la_forme_du_show(): void
    {
        $reservation = $this->reservationEnAttente();
        Sanctum::actingAs($this->client);

        $ecriture = $this->postJson("/api/bookings/{$reservation->id}/cancel", ['reason' => 'Changement de dates'])
            ->assertOk()->json('data');

        $this->assertEcritureALaFormeDuShow($ecriture, $this->show($reservation->id), geste: 'cancel');
    }

    public function test_refuser_rend_la_forme_du_show(): void
    {
        $reservation = $this->reservationEnAttente();
        Sanctum::actingAs($this->bailleur);

        $ecriture = $this->postJson("/api/bookings/{$reservation->id}/reject", ['reason' => 'Bien indisponible'])
            ->assertOk()->json('data');

        $this->assertEcritureALaFormeDuShow($ecriture, $this->show($reservation->id), geste: 'reject');
    }

    /** Une réservation en attente, avec un acompte payé : le `show` rend tout ce qu'il peut rendre. */
    private function reservationEnAttente(): Booking
    {
        $reservation = Booking::factory()->create([
            'property_id' => $this->bien->id,
            'customer_id' => $this->fiche->id,
            'created_by_id' => $this->client->id,
        ]);
        BookingPayment::factory()->paid()->create(['booking_id' => $reservation->id]);

        return $reservation;
    }

    /** @return array<string, mixed> */
    private function show(int $id, bool $avecPaiement = true): array
    {
        $show = $this->getJson("/api/bookings/{$id}")->assertOk()->json('data');

        // ADR-0071, point 4 : la donnée remplit ce que le `show` rend, sinon deux formes vides se
        // ressemblent.
        $this->assertIsString($show['property']['location']['city'] ?? null, 'le show doit rendre l\'adresse du bien');
        $this->assertIsArray($show['customer'] ?? null, 'le show doit rendre le client');
        $this->assertArrayHasKey('can_refund', $show);
        $this->assertArrayHasKey('refund_status', $show);
        $this->assertArrayHasKey('booking_payments', $show);
        if ($avecPaiement) {
            $this->assertNotEmpty($show['booking_payments'], 'le show doit rendre l\'acompte');
        }

        return $show;
    }
}
