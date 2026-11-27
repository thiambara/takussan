<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\User;
use App\Services\Model\BookingPaymentService;
use App\Services\Review\ReviewEligibility;
use Illuminate\Support\Collection;

/**
 * TCK-3007 (ADR-0139) — les gestes d'une réservation : pour chacun, « possible MAINTENANT pour ce
 * lecteur », policy ET état compris. La ressource en tire `abilities` (`BookingResource`), la fiche
 * n'en recalcule aucun ; les services relisent les mêmes prédicats d'état sous leur verrou avant
 * d'écrire ({@see self::decidable()}, {@see self::annulable()}, {@see self::contreProposable()},
 * {@see self::dossierOuvert()}) : une règle d'état n'a qu'une définition.
 *
 * Le rôle sur l'objet (bailleur, client, personnel) reste jugé par `BookingPolicy`,
 * `BookingMoneyAccess` et `LeasePolicy::createOn` ; ce module ne refait aucune de ces règles, il les
 * compose avec l'état.
 */
final class GestesDeLaReservation
{
    /** Les clés d'`abilities`, dans leur ordre de service. */
    public const GESTES = [
        'confirm', 'reject', 'cancel', 'counter_offer', 'answer_counter_offer', 'record_payment', 'refund',
        'create_lease', 'pay', 'upload_dossier_piece', 'request_dossier_piece', 'manage_guarantors', 'leave_review',
    ];

    /** Les statuts d'un dossier (pièces et garants) encore ouvert (`booking.dossier_closed` sinon). */
    public const STATUTS_DU_DOSSIER_OUVERT = [BookingStatus::Pending, BookingStatus::Confirmed];

    /** Les statuts où une réservation ne s'annule plus (`booking.cannot_cancel`). */
    private const TERMINAUX = [BookingStatus::Cancelled, BookingStatus::Completed, BookingStatus::Expired, BookingStatus::Rejected];

    /**
     * @return array<string, bool> une clé par {@see self::GESTES}
     */
    public function pour(User $lecteur, Booking $booking): array
    {
        $valider = $this->peutConfirmer($lecteur, $booking);

        return [
            'confirm' => $valider,
            // Refuser : la même garde qu'accepter (`validate`, sur une demande en attente).
            'reject' => $valider,
            'cancel' => $this->peutAnnuler($lecteur, $booking),
            'counter_offer' => $this->peutContreProposer($lecteur, $booking),
            'answer_counter_offer' => $this->peutRepondreALaContreOffre($lecteur, $booking),
            'record_payment' => $this->peutEncaisser($lecteur, $booking),
            'refund' => $this->peutRembourser($lecteur, $booking),
            'create_lease' => $this->peutCreerLeBail($lecteur, $booking),
            'pay' => $this->peutPayer($lecteur, $booking),
            'upload_dossier_piece' => $this->peutDeposerUnePiece($lecteur, $booking),
            'request_dossier_piece' => $this->peutDemanderUnePiece($lecteur, $booking),
            'manage_guarantors' => $this->peutGererLesGarants($lecteur, $booking),
            'leave_review' => $this->peutLaisserUnAvis($lecteur, $booking),
        ];
    }

    /** Accepter ou refuser : `BookingPolicy::validate` (bailleur compris), sur une demande en attente. */
    public function peutConfirmer(User $lecteur, Booking $booking): bool
    {
        return self::decidable($booking) && $lecteur->can('validate', $booking);
    }

    /** `BookingPolicy::cancel` (client, bailleur, personnel sous `bookings.cancel`), hors terminal et hors séjour commencé. */
    public function peutAnnuler(User $lecteur, Booking $booking): bool
    {
        return self::annulable($booking) && $lecteur->can('cancel', $booking);
    }

    /** Une offre d'achat en attente, au personnel sous `bookings.validate` (`proposeCounterOffer`). */
    public function peutContreProposer(User $lecteur, Booking $booking): bool
    {
        return self::contreProposable($booking) && $lecteur->can('proposeCounterOffer', $booking);
    }

    /** Le client, tant que la dernière contre-offre attend sa réponse (`pending`, non échue). */
    public function peutRepondreALaContreOffre(User $lecteur, Booking $booking): bool
    {
        return $booking->status === BookingStatus::Pending
            && $booking->latestCounterOffer?->isOpen() === true
            && $lecteur->can('answerCounterOffer', $booking);
    }

    /** L'encaisseur (`payments.record` pour le personnel, ADR-0003), dans les statuts de l'API. */
    public function peutEncaisser(User $lecteur, Booking $booking): bool
    {
        return $booking->acceptsStaffPayment() && BookingMoneyAccess::canRecordAsCollector($lecteur, $booking);
    }

    /** Qui rembourse (`BookingMoneyAccess::canRefund`), quand un paiement encaissé reste à rendre. */
    public function peutRembourser(User $lecteur, Booking $booking): bool
    {
        return self::paiements($booking)->contains(fn (BookingPayment $p): bool => $p->status === PaymentStatus::Paid)
            && BookingMoneyAccess::canRefund($lecteur, $booking);
    }

    /**
     * La candidature ACCEPTÉE d'un bien à louer mène au bail (P48.03, TCK-2594) : qui crée un bail sur ce
     * bien (`LeasePolicy::createOn` — le bailleur, ou le personnel sous `leases.create`).
     */
    public function peutCreerLeBail(User $lecteur, Booking $booking): bool
    {
        $bien = $booking->property;

        return $booking->kind === BookingKind::Application
            && $booking->status === BookingStatus::Confirmed
            && $bien !== null
            && $bien->contract_type === ContractType::Rent
            && $lecteur->can('createOn', [Lease::class, $bien]);
    }

    /**
     * Le client paie un SÉJOUR ouvert tant qu'il reste dû : le montant d'une candidature est un loyer,
     * celui d'une offre un prix (TCK-2879) ; le dû est celui que l'écriture dérivera
     * (`BookingPaymentService::aRegler`, que `dueFromCustomer` enveloppe).
     */
    public function peutPayer(User $lecteur, Booking $booking): bool
    {
        return $booking->kind === BookingKind::Stay
            && $booking->isPayableByCustomer()
            && self::estLePayeurClient($lecteur, $booking)
            && app(BookingPaymentService::class)->aRegler($booking) !== null;
    }

    /** Le client ou le personnel de l'agence (`uploadDossierPiece`), sur un dossier ouvert. */
    public function peutDeposerUnePiece(User $lecteur, Booking $booking): bool
    {
        return self::dossierOuvert($booking) && $lecteur->can('uploadDossierPiece', $booking);
    }

    /** Le personnel de l'agence seul (`requestDossierPiece`), sur un dossier ouvert. */
    public function peutDemanderUnePiece(User $lecteur, Booking $booking): bool
    {
        return self::dossierOuvert($booking) && $lecteur->can('requestDossierPiece', $booking);
    }

    /** Les auteurs du dossier (`manageGuarantors`), sur un dossier ouvert. */
    public function peutGererLesGarants(User $lecteur, Booking $booking): bool
    {
        return self::dossierOuvert($booking) && $lecteur->can('manageGuarantors', $booking);
    }

    /** Le client d'une réservation honorée : la preuve que `ReviewEligibility::forProperty` retient. */
    public function peutLaisserUnAvis(User $lecteur, Booking $booking): bool
    {
        return in_array($booking->status, ReviewEligibility::BOOKING_STATUSES, true)
            && self::estLeClient($lecteur, $booking);
    }

    /**
     * Le client de la réservation qui n'en est pas aussi l'encaisseur : son paiement part `pending` vers
     * la passerelle, au montant que l'API dérive (`StoreBookingPaymentRequest::payeurClient`).
     */
    public static function estLePayeurClient(User $user, Booking $booking): bool
    {
        return self::estLeClient($user, $booking) && ! BookingMoneyAccess::canRecordAsCollector($user, $booking);
    }

    /* ─────────────── Les prédicats d'état, relus par les services sous leur verrou ─────────────── */

    /** Accepter, refuser : une demande en attente (`booking.not_pending_confirm`, `…_reject`). */
    public static function decidable(Booking $booking): bool
    {
        return $booking->status === BookingStatus::Pending;
    }

    /**
     * Annuler : hors des états terminaux, et pas un séjour confirmé dont le premier jour est arrivé
     * (TCK-1301 : il reste au calendrier et passe `completed` au lendemain de sa fin).
     */
    public static function annulable(Booking $booking): bool
    {
        if (in_array($booking->status, self::TERMINAUX, true)) {
            return false;
        }

        return ! ($booking->status === BookingStatus::Confirmed
            && $booking->start_date !== null
            && $booking->start_date->toDateString() <= now()->toDateString());
    }

    /** Contre-proposer : une offre d'achat en attente (`booking.counter_offer_not_allowed`). */
    public static function contreProposable(Booking $booking): bool
    {
        return $booking->kind === BookingKind::Offer && $booking->status === BookingStatus::Pending;
    }

    /** Un dossier (pièces, garants) : une candidature ou une offre, encore ouverte. */
    public static function dossierOuvert(Booking $booking): bool
    {
        return in_array($booking->kind, [BookingKind::Application, BookingKind::Offer], true)
            && in_array($booking->status, self::STATUTS_DU_DOSSIER_OUVERT, true);
    }

    private static function estLeClient(User $user, Booking $booking): bool
    {
        return $booking->customer?->user_id !== null && (int) $booking->customer->user_id === (int) $user->id;
    }

    /**
     * Les paiements chargés par la page (`BookingController::presenter`), sinon lus une fois.
     *
     * @return Collection<int, BookingPayment>
     */
    private static function paiements(Booking $booking): Collection
    {
        return $booking->relationLoaded('payments') ? $booking->payments : $booking->payments()->get();
    }
}
