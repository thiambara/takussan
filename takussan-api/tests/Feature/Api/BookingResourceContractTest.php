<?php

namespace Tests\Feature\Api;

use App\Http\Resources\BookingResource;
use App\Models\Booking;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * TCK-1180 (P100.02) — le contrat de `BookingResource`, clé par clé.
 *
 * Le front lisait `deposit_paid`, `deposit_date`, `completion_date`, `rejection_date` et
 * `expiration_date`, que la ressource n'a jamais émis : le badge « Acompte payé », le bloc « Expire
 * le » et trois événements de la chronologie ne s'affichaient jamais, et rien ne le voyait. Ce test
 * fige les clés EXACTES, comme `LeasePaymentResourceContractTest` ; le type `Booking` de
 * `takussan-web/src/types/booking.ts` s'aligne sur elles.
 */
class BookingResourceContractTest extends TestCase
{
    use RefreshDatabase;

    public const KEYS = [
        'id', 'reference_number', 'property_id', 'customer_id', 'agency_id', 'status',
        'total_amount', 'deposit_amount', 'currency', 'start_date', 'end_date',
        'confirmed_at', 'cancelled_at', 'expires_at', 'response_deadline',
        'cancellation_by', 'cancellation_reason', 'notes', 'created_at',
    ];

    /** Seulement quand `payments` est chargé (TCK-596). */
    public const KEYS_AVEC_PAIEMENTS = ['refund_status', 'booking_payments'];

    public function test_les_cles_d_une_ligne_de_liste_sont_exactement_celles_du_contrat(): void
    {
        $booking = Booking::factory()->create()->fresh();

        $row = BookingResource::make($booking)->resolve(Request::create('/'));

        $this->assertEqualsCanonicalizing(self::KEYS, array_keys($row));
    }

    public function test_avec_les_paiements_charges_la_fiche_ajoute_leurs_deux_cles(): void
    {
        $booking = Booking::factory()->create()->fresh()->load('payments');

        $row = BookingResource::make($booking)->resolve(Request::create('/'));

        $this->assertEqualsCanonicalizing([...self::KEYS, ...self::KEYS_AVEC_PAIEMENTS], array_keys($row));
    }
}
