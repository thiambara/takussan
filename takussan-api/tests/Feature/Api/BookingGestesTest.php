<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\BookingCounterOffer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\CounterOfferStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\Review;
use App\Models\User;
use App\Services\Booking\GestesDeLaReservation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\Support\EncaissementsPlateforme;
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
    use BuildsBookingStakeholders, EncaissementsPlateforme, RefreshDatabase;

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

    /* ─────────────── Vérification adverse de TCK-3007 : le geste servi = l'écriture acceptée ─────────────── */

    public function test_le_client_ne_paie_ni_une_candidature_ni_une_offre_a_l_ecriture_non_plus(): void
    {
        Sanctum::actingAs($this->client);
        foreach ([BookingKind::Application, BookingKind::Offer] as $nature) {
            $booking = $this->bookingOfClient(['kind' => $nature, 'total_amount' => 20_000, 'deposit_amount' => 10_000]);
            $this->assertFalse($this->geste($this->client, $booking, 'pay'));

            $this->postJson("/api/bookings/{$booking->id}/payments", [])
                ->assertStatus(422)
                ->assertJsonPath('code', 'booking_payment.not_a_stay');
        }
        $this->assertDatabaseCount('booking_payments', 0);

        // Second chemin : le séjour, lui, se paie.
        $sejour = $this->bookingOfClient(['total_amount' => 20_000, 'deposit_amount' => 10_000]);
        $this->postJson("/api/bookings/{$sejour->id}/payments", [])->assertCreated();
    }

    public function test_laisser_un_avis_s_eteint_une_fois_l_avis_depose_meme_retire(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Completed]);
        $this->assertTrue($this->geste($this->client, $booking, 'leave_review'));

        $avis = Review::factory()->create([
            'reviewable_type' => $this->property->getMorphClass(),
            'reviewable_id' => $this->property->id,
            'author_id' => $this->client->id,
        ]);
        $this->assertFalse($this->geste($this->client, $booking, 'leave_review'));

        // Retiré par la plateforme, il compte encore (`ReviewController::storeForProperty`, verif-597 M2).
        $avis->delete();
        $this->assertFalse($this->geste($this->client, $booking, 'leave_review'));
    }

    public function test_un_avis_d_un_autre_auteur_ou_sur_un_autre_bien_n_eteint_rien(): void
    {
        Review::factory()->create(['reviewable_type' => $this->property->getMorphClass(), 'reviewable_id' => $this->property->id]);
        Review::factory()->create(['author_id' => $this->client->id]);

        $this->assertTrue($this->geste($this->client, $this->bookingOfClient(['status' => BookingStatus::Completed]), 'leave_review'));
    }

    public function test_accepter_s_eteint_sur_un_sejour_qui_chevauche_mais_refuser_reste(): void
    {
        $this->bookingOfClient(['status' => BookingStatus::Confirmed]);
        $demande = $this->bookingOfClient();

        $gestes = $this->gestesDe($this->agent, $demande);
        $this->assertFalse($gestes['confirm']);
        $this->assertTrue($gestes['reject']);
        $this->postJson("/api/bookings/{$demande->id}/confirm")->assertStatus(422)->assertJsonPath('code', 'booking.dates_overlap');
    }

    public function test_accepter_s_eteint_quand_une_autre_candidature_est_acceptee(): void
    {
        $candidature = ['kind' => BookingKind::Application, 'start_date' => null, 'end_date' => null];
        $this->bookingOfClient([...$candidature, 'status' => BookingStatus::Confirmed]);
        $seconde = $this->bookingOfClient($candidature);

        $this->assertFalse($this->geste($this->agent, $seconde, 'confirm'));
        $this->postJson("/api/bookings/{$seconde->id}/confirm")->assertStatus(409)->assertJsonPath('code', 'booking.application_already_accepted');
    }

    public function test_accepter_s_eteint_sur_un_bien_deja_loue_et_revient_sans_bail(): void
    {
        $candidature = $this->bookingOfClient(['kind' => BookingKind::Application, 'start_date' => now()->addDays(60)->toDateString(), 'end_date' => null]);
        $this->assertTrue($this->geste($this->agent, $candidature, 'confirm'));

        Lease::factory()->create([
            'property_id' => $this->property->id,
            'landlord_id' => $this->property->user_id,
            'agency_id' => $this->agency->id,
            'status' => LeaseStatus::Active,
            'start_date' => now()->subDays(30)->toDateString(),
            'end_date' => now()->addDays(300)->toDateString(),
        ]);

        $this->assertFalse($this->geste($this->agent, $candidature, 'confirm'));
        $this->postJson("/api/bookings/{$candidature->id}/confirm")->assertStatus(409)->assertJsonPath('code', 'booking.property_already_leased');
    }

    public function test_repondre_a_une_contre_offre_et_l_ecriture_jugent_la_meme_ouverture(): void
    {
        $offre = $this->bookingOfClient(['kind' => BookingKind::Offer]);
        $contre = BookingCounterOffer::create([
            'booking_id' => $offre->id,
            'amount' => '15000',
            'valid_until' => '2026-11-20',
            'created_by_id' => $this->agent->id,
            'status' => CounterOfferStatus::Pending->value,
        ]);

        Carbon::setTestNow('2026-11-21 10:00:00');
        $this->assertFalse($this->geste($this->client, $offre, 'answer_counter_offer'));
        $this->postJson("/api/bookings/{$offre->id}/counter-offers/{$contre->id}/accept")
            ->assertStatus(422)->assertJsonPath('code', 'booking.counter_offer_expired');
    }

    public function test_rembourser_s_eteint_sur_un_acompte_solde_par_la_plateforme(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Cancelled]);
        $this->soldeParLaPlateforme($this->paidDeposit($booking));

        $this->assertFalse($this->geste($this->landlord, $booking, 'refund'));

        // Second chemin : soldé par l'intégration de l'agence, il se rembourse à la main.
        $autre = $this->bookingOfClient(['status' => BookingStatus::Cancelled]);
        $this->soldeParLAgence($this->paidDeposit($autre), $this->agency);
        $this->assertTrue($this->geste($this->landlord, $autre, 'refund'));
    }

    public function test_un_acompte_deja_rendu_en_entier_ne_se_rembourse_plus(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Cancelled]);
        $this->paidDeposit($booking)->update(['refund_amount' => 10_000]);

        $this->assertFalse($this->geste($this->landlord, $booking, 'refund'));
    }

    public function test_chaque_paiement_dit_s_il_se_rembourse_a_la_main(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Cancelled]);
        $plateforme = $this->soldeParLaPlateforme($this->paidDeposit($booking));
        $especes = $this->paidDeposit($booking, 5_000);
        $attente = $this->paidDeposit($booking, 3_000, PaymentStatus::Pending);

        Sanctum::actingAs($this->landlord);
        $parId = collect($this->getJson("/api/bookings/{$booking->id}")->assertOk()->json('data.booking_payments'))
            ->mapWithKeys(fn (array $p): array => [$p['id'] => $p['refundable'] ?? null]);

        $this->assertFalse($parId[$plateforme->id], 'soldé par la plateforme : remboursé par le fournisseur');
        $this->assertTrue($parId[$especes->id]);
        $this->assertFalse($parId[$attente->id], 'rien d\'encaissé');
        $this->assertTrue($this->geste($this->landlord, $booking, 'refund'));
    }
}
