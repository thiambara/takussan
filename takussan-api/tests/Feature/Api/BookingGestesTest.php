<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\BookingCounterOffer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\CounterOfferStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\User;
use App\Services\Booking\GestesDeLaReservation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-3007 (ADR-0139) — `abilities` d'une réservation : chaque geste que l'API accepterait MAINTENANT
 * pour CE lecteur, policy et état compris, jugé par `GestesDeLaReservation`. Une clé par geste, vraie
 * puis fausse. La fiche n'en recalcule plus aucun.
 *
 * Reprend `BookingGestesDuLecteurTest` (TCK-2958, trois clés) : un séjour confirmé dont le premier jour
 * est arrivé ne s'annule plus (TCK-1301), la veille, si.
 */
class BookingGestesTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Carbon::setTestNow('2026-11-18 10:00:00');
        $this->buildStakeholders();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** @return array<string, bool> */
    private function gestesDe(User $lecteur, Booking $booking): array
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson("/api/bookings/{$booking->id}")->assertOk()->json('data.abilities');
    }

    private function geste(User $lecteur, Booking $booking, string $cle): bool
    {
        $gestes = $this->gestesDe($lecteur, $booking);
        $this->assertArrayHasKey($cle, $gestes);

        return $gestes[$cle];
    }

    public function test_abilities_porte_une_cle_par_geste_et_le_show_ne_sert_plus_can_refund(): void
    {
        Sanctum::actingAs($this->client);
        $data = $this->getJson("/api/bookings/{$this->bookingOfClient()->id}")->assertOk()->json('data');

        $this->assertSame(GestesDeLaReservation::GESTES, array_keys($data['abilities']));
        $this->assertArrayNotHasKey('can_refund', $data);
    }

    /* ─────────────────────────── AC1 — le Bailleur décide et annule ─────────────────────────── */

    public function test_le_bailleur_accepte_refuse_et_annule_une_demande_en_attente_de_son_bien(): void
    {
        $gestes = $this->gestesDe($this->landlord, $this->bookingOfClient());

        $this->assertTrue($gestes['confirm']);
        $this->assertTrue($gestes['reject']);
        $this->assertTrue($gestes['cancel']);

        // … et l'API accepte chacun des trois.
        foreach (['confirm', 'reject', 'cancel'] as $geste) {
            $this->postJson("/api/bookings/{$this->bookingOfClient()->id}/{$geste}")->assertOk();
        }
    }

    public function test_le_bailleur_ne_decide_plus_une_reservation_confirmee(): void
    {
        $gestes = $this->gestesDe($this->landlord, $this->bookingOfClient(['status' => BookingStatus::Confirmed]));

        $this->assertFalse($gestes['confirm']);
        $this->assertFalse($gestes['reject']);
    }

    public function test_confirmer_suit_la_capacite_du_personnel_dans_l_agence_de_la_reservation(): void
    {
        $booking = $this->bookingOfClient();

        $this->assertTrue($this->geste($this->agent, $booking, 'confirm'));
        $this->assertFalse($this->geste($this->agentWithout($this->agency, Capability::BookingsValidate), $booking, 'confirm'));
        $this->assertFalse($this->geste($this->client, $booking, 'confirm'));
        $this->assertFalse($this->geste($this->client, $booking, 'reject'));
    }

    /* ─────────────────────────────────────── Annuler ─────────────────────────────────────── */

    public function test_un_sejour_confirme_qui_commence_aujourd_hui_ne_s_annule_plus(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Confirmed, 'start_date' => '2026-11-18', 'end_date' => '2026-11-28']);

        $this->assertFalse($this->geste($this->client, $booking, 'cancel'));
    }

    public function test_un_sejour_confirme_qui_commence_demain_s_annule(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Confirmed, 'start_date' => '2026-11-19', 'end_date' => '2026-11-29']);

        $this->assertTrue($this->geste($this->client, $booking, 'cancel'));
    }

    public function test_une_reservation_terminee_ne_s_annule_pas(): void
    {
        $this->assertFalse($this->geste($this->client, $this->bookingOfClient(['status' => BookingStatus::Completed]), 'cancel'));
    }

    /* ──────────────────────────────────── Contre-offre ──────────────────────────────────── */

    public function test_contre_proposer_une_offre_en_attente_au_seul_personnel(): void
    {
        $offre = $this->bookingOfClient(['kind' => BookingKind::Offer]);

        $this->assertTrue($this->geste($this->agent, $offre, 'counter_offer'));
        // Le bailleur décide, il ne négocie pas (`BookingPolicy::proposeCounterOffer`).
        $this->assertFalse($this->geste($this->landlord, $offre, 'counter_offer'));
        // Pas un séjour (ADR-0102 : la nature se juge à l'API).
        $this->assertFalse($this->geste($this->agent, $this->bookingOfClient(), 'counter_offer'));
    }

    public function test_repondre_a_une_contre_offre_ouverte_au_seul_client(): void
    {
        $offre = $this->bookingOfClient(['kind' => BookingKind::Offer]);
        $this->assertFalse($this->geste($this->client, $offre, 'answer_counter_offer'));

        BookingCounterOffer::create([
            'booking_id' => $offre->id,
            'amount' => '15000',
            'valid_until' => '2026-11-20',
            'created_by_id' => $this->agent->id,
            'status' => CounterOfferStatus::Pending->value,
        ]);

        $this->assertTrue($this->geste($this->client, $offre, 'answer_counter_offer'));
        $this->assertFalse($this->geste($this->agent, $offre, 'answer_counter_offer'));

        // Échue, elle n'attend plus de réponse.
        Carbon::setTestNow('2026-11-21 10:00:00');
        $this->assertFalse($this->geste($this->client, $offre, 'answer_counter_offer'));
    }

    /* ──────────────────────────────── AC2 — l'encaissement ──────────────────────────────── */

    public function test_encaisser_exige_payments_record_pour_le_personnel(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Confirmed]);

        $this->assertTrue($this->geste($this->agent, $booking, 'record_payment'));
        $this->assertFalse($this->geste($this->agentWithout($this->agency, Capability::PaymentsRecord), $booking, 'record_payment'));
        // Le bailleur direct encaisse sans capacité (TCK-596) ; le client, jamais.
        $this->assertTrue($this->geste($this->landlord, $booking, 'record_payment'));
        $this->assertFalse($this->geste($this->client, $booking, 'record_payment'));
        // Les statuts restent ceux de l'API (`Booking::STAFF_PAYABLE_STATUSES`).
        $this->assertFalse($this->geste($this->agent, $this->bookingOfClient(['status' => BookingStatus::Cancelled]), 'record_payment'));
    }

    public function test_un_membre_du_personnel_sans_payments_record_recoit_403_a_l_encaissement(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Confirmed]);
        $corps = ['amount' => 10_000, 'payment_type' => BookingPaymentType::Deposit->value, 'status' => PaymentStatus::Paid->value];

        Sanctum::actingAs($this->agentWithout($this->agency, Capability::PaymentsRecord));
        $this->postJson("/api/bookings/{$booking->id}/payments", $corps)->assertForbidden();
        $this->assertDatabaseCount('booking_payments', 0);

        // Second chemin : l'agent qui la porte (rôle système) encaisse.
        Sanctum::actingAs($this->agent);
        $this->postJson("/api/bookings/{$booking->id}/payments", $corps)->assertCreated()->assertJsonPath('data.status', 'paid');
    }

    /* ─────────────────────────────────────── Rembourser ─────────────────────────────────────── */

    public function test_rembourser_exige_un_paiement_encaisse_et_le_droit(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Cancelled]);
        $this->assertFalse($this->geste($this->landlord, $booking, 'refund'), 'rien d\'encaissé, rien à rembourser');

        $this->paidDeposit($booking);

        $this->assertTrue($this->geste($this->landlord, $booking, 'refund'));
        $this->assertFalse($this->geste($this->client, $booking, 'refund'));
        // L'agent système ne porte pas `bookings.refund`.
        $this->assertFalse($this->geste($this->agent, $booking, 'refund'));
        $this->assertTrue($this->geste($this->agentWith($this->agency, Capability::BookingsRefund), $booking, 'refund'));
    }

    /* ─────────────────────────────────────── Créer le bail ─────────────────────────────────────── */

    public function test_creer_le_bail_d_une_candidature_acceptee_d_un_bien_a_louer(): void
    {
        $acceptee = $this->bookingOfClient(['kind' => BookingKind::Application, 'status' => BookingStatus::Confirmed]);

        $this->assertTrue($this->geste($this->agent, $acceptee, 'create_lease'));
        $this->assertFalse($this->geste($this->agentWithout($this->agency, Capability::LeasesCreate), $acceptee, 'create_lease'));
        $this->assertFalse($this->geste($this->client, $acceptee, 'create_lease'));
        // En attente : pas encore ; un séjour confirmé : jamais (TCK-2594).
        $this->assertFalse($this->geste($this->agent, $this->bookingOfClient(['kind' => BookingKind::Application]), 'create_lease'));
        $this->assertFalse($this->geste($this->agent, $this->bookingOfClient(['status' => BookingStatus::Confirmed]), 'create_lease'));
    }

    /* ─────────────────────────────────────── Payer (client) ─────────────────────────────────────── */

    public function test_payer_un_sejour_ouvert_au_seul_client_tant_qu_il_reste_du(): void
    {
        $booking = $this->bookingOfClient(['total_amount' => 20_000, 'deposit_amount' => 10_000]);

        $this->assertTrue($this->geste($this->client, $booking, 'pay'));
        $this->assertFalse($this->geste($this->agent, $booking, 'pay'));
        $this->assertFalse($this->geste($this->client, $this->bookingOfClient(['status' => BookingStatus::Cancelled]), 'pay'));
        // Une candidature ne se règle pas sur la réservation (son montant est un loyer).
        $this->assertFalse($this->geste($this->client, $this->bookingOfClient(['kind' => BookingKind::Application]), 'pay'));

        $this->paidDeposit($booking, 20_000);
        $this->assertFalse($this->geste($this->client, $booking, 'pay'), 'tout est réglé');
    }

    /* ─────────────────────────────────────── Dossier et garants ─────────────────────────────────────── */

    public function test_deposer_demander_et_garants_sur_un_dossier_ouvert(): void
    {
        $candidature = $this->bookingOfClient(['kind' => BookingKind::Application]);

        $client = $this->gestesDe($this->client, $candidature);
        $this->assertTrue($client['upload_dossier_piece']);
        $this->assertFalse($client['request_dossier_piece']);
        $this->assertTrue($client['manage_guarantors']);

        $agent = $this->gestesDe($this->agent, $candidature);
        $this->assertTrue($agent['upload_dossier_piece']);
        $this->assertTrue($agent['request_dossier_piece']);
        $this->assertTrue($agent['manage_guarantors']);

        // Le bailleur lit le dossier, il ne le remplit pas.
        $bailleur = $this->gestesDe($this->landlord, $candidature);
        $this->assertFalse($bailleur['upload_dossier_piece']);
        $this->assertFalse($bailleur['manage_guarantors']);

        // Fermé (annulée), ou sans dossier (un séjour) : aucun.
        foreach ([$this->bookingOfClient(['kind' => BookingKind::Application, 'status' => BookingStatus::Cancelled]), $this->bookingOfClient()] as $sans) {
            $gestes = $this->gestesDe($this->agent, $sans);
            $this->assertFalse($gestes['upload_dossier_piece']);
            $this->assertFalse($gestes['request_dossier_piece']);
            $this->assertFalse($gestes['manage_guarantors']);
        }
    }

    /* ─────────────────────────────────────── Laisser un avis ─────────────────────────────────────── */

    public function test_laisser_un_avis_au_client_d_une_reservation_honoree(): void
    {
        $this->assertTrue($this->geste($this->client, $this->bookingOfClient(['status' => BookingStatus::Confirmed]), 'leave_review'));
        $this->assertFalse($this->geste($this->client, $this->bookingOfClient(), 'leave_review'));
        $this->assertFalse($this->geste($this->agent, $this->bookingOfClient(['status' => BookingStatus::Completed]), 'leave_review'));
    }
}
