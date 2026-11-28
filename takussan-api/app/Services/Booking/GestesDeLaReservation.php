<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\BookingCounterOffer;
use App\Models\BookingPayment;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\CounterOfferStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\User;
use App\Services\Billing\PlatformPayoutService;
use App\Services\Model\BookingPaymentService;
use App\Services\Model\BookingService;
use App\Services\Model\LeaseService;
use App\Services\Review\ReviewEligibility;
use Illuminate\Support\Collection;

/**
 * TCK-3007 (ADR-0139) — les gestes d'une réservation : pour chacun, « possible MAINTENANT pour ce
 * lecteur », policy ET état compris. La ressource en tire `abilities` (`BookingResource`), la fiche
 * n'en recalcule aucun ; les services relisent les mêmes prédicats d'état sous leur verrou avant
 * d'écrire ({@see self::decidable()}, {@see self::annulable()}, {@see self::contreProposable()},
 * {@see self::dossierOuvert()}, {@see self::refusDuPaiementDuClient()}, {@see self::refusDeLaContreOffre()},
 * {@see self::conflitALaConfirmation()}) : une règle d'état n'a qu'une définition.
 *
 * Coût : `abilities` n'est servi que par le `show` et la carte du fil (un objet distinct par carte), jamais en
 * liste (ADR-0139 § 5). Les jugements qui lisent la base (conflits de la confirmation, avis déjà déposé,
 * paiements à rendre) ne s'évaluent qu'après les gardes gratuites qui les rendent pertinents : une requête
 * par règle, pour le lecteur qui pourrait faire le geste, et aucune sinon.
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
        return [
            'confirm' => $this->peutConfirmer($lecteur, $booking),
            'reject' => $this->peutRefuser($lecteur, $booking),
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

    /**
     * Accepter : `BookingPolicy::validate` (bailleur compris), sur une demande en attente, sans le conflit
     * que l'écriture refuserait (vérification adverse de TCK-3007 : la fiche offrait Accepter, l'API
     * rendait 409 ou 422).
     */
    public function peutConfirmer(User $lecteur, Booking $booking): bool
    {
        return $this->peutRefuser($lecteur, $booking) && $this->conflitALaConfirmation($booking) === null;
    }

    /** Refuser : la garde d'accepter sans les conflits — une demande qui ne peut plus être acceptée se refuse. */
    public function peutRefuser(User $lecteur, Booking $booking): bool
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
        $offre = $booking->latestCounterOffer;

        return $offre !== null
            && self::refusDeLaContreOffre($booking, $offre) === null
            && $lecteur->can('answerCounterOffer', $booking);
    }

    /** L'encaisseur (`payments.record` pour le personnel, ADR-0003), dans les statuts de l'API. */
    public function peutEncaisser(User $lecteur, Booking $booking): bool
    {
        return $booking->acceptsStaffPayment() && BookingMoneyAccess::canRecordAsCollector($lecteur, $booking);
    }

    /** Qui rembourse (`BookingMoneyAccess::canRefund`), quand un paiement encaissé reste à rendre à la main. */
    public function peutRembourser(User $lecteur, Booking $booking): bool
    {
        return BookingMoneyAccess::canRefund($lecteur, $booking)
            && self::paiements($booking)->contains(fn (BookingPayment $p): bool => $this->seRembourseALaMain($p));
    }

    /**
     * Un paiement que `BookingPaymentService::refund` accepterait : encaissé (`refund_unpaid`), pas
     * entièrement rendu (`refund_exceeds_paid`), et pas soldé par la plateforme, dont le remboursement
     * passe par le fournisseur (`refund_settled_by_platform`, TCK-1160).
     */
    public function seRembourseALaMain(BookingPayment $paiement): bool
    {
        return $paiement->status === PaymentStatus::Paid
            && (float) ($paiement->refund_amount ?? 0) < (float) $paiement->amount
            && ! app(PlatformPayoutService::class)->isSettledByPlatform($paiement);
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
        return self::refusDuPaiementDuClient($booking) === null
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

    /**
     * Le client d'une réservation honorée (la preuve que `ReviewEligibility::forProperty` retient) qui
     * n'a pas déjà noté le bien : `ReviewController::storeForProperty` refuse le second avis (422
     * `review.property_already_reviewed`), y compris quand le premier a été retiré par la plateforme.
     */
    public function peutLaisserUnAvis(User $lecteur, Booking $booking): bool
    {
        $bien = $booking->property;

        return in_array($booking->status, ReviewEligibility::BOOKING_STATUSES, true)
            && self::estLeClient($lecteur, $booking)
            && $bien !== null
            && ! $bien->reviews()->withTrashed()->where('author_id', $lecteur->id)->exists();
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

    /**
     * Le client paie sur la réservation (`BookingPaymentController::store`) : un SÉJOUR, `pending` ou
     * `confirmed` (TCK-1914). Le montant d'une candidature est un loyer, celui d'une offre un prix
     * (TCK-2879, ADR-0102) : ni l'un ni l'autre ne se règle ici. `null` : payable ; sinon le code du refus.
     */
    public static function refusDuPaiementDuClient(Booking $booking): ?string
    {
        if ($booking->kind !== BookingKind::Stay) {
            return 'booking_payment.not_a_stay';
        }

        return $booking->isPayableByCustomer() ? null : 'booking_payment.booking_not_payable';
    }

    /**
     * Répondre à une contre-offre (TCK-2879) : la sienne, ni échue (`booking.counter_offer_expired`),
     * ni remplacée ou traitée, sur une offre encore en attente (`booking.counter_offer_not_open`).
     * `BookingCounterOfferService::lockOpen` le relit sous verrou. `null` : ouverte.
     */
    public static function refusDeLaContreOffre(Booking $booking, BookingCounterOffer $offre): ?string
    {
        if ($offre->status === CounterOfferStatus::Expired || ($offre->status === CounterOfferStatus::Pending && $offre->isOverdue())) {
            return 'booking.counter_offer_expired';
        }

        return $offre->status === CounterOfferStatus::Pending && $booking->status === BookingStatus::Pending
            ? null
            : 'booking.counter_offer_not_open';
    }

    /**
     * Ce qui empêche d'accepter une demande, au-delà de son statut — `[statut HTTP, code]`, ou `null`.
     * `BookingService::confirm` le rejuge sous le verrou du bien (piège PostgreSQL n° 2 : la ligne
     * parent), la fiche en tire `abilities.confirm`. Dans l'ordre de l'écriture :
     *
     * - les nuits (TCK-596, ADR-0041) : un séjour confirmé ou une indisponibilité qui chevauche
     *   `[début, fin)` (`PropertyAvailabilityService::refus`) ;
     * - TCK-2734 (décision du porteur du 2026-11-11) — une seule candidature confirmée par bien : deux
     *   acceptations promettraient le même logement à deux personnes. Les offres et les séjours n'y sont
     *   pas soumis. Une candidature quitte `confirmed` annulée, convertie en bail, ou close par le bail
     *   d'un autre locataire ({@see LeaseService::cloreLesCandidaturesDuBien()}) ;
     * - TCK-2747 (décision 6 du porteur, 2026-11-12) — pas de candidature acceptée sur un logement qu'un
     *   bail occupe ou occupera ({@see BookingService::bauxQuiOccupent()}).
     *
     * @return array{0: int, 1: string}|null
     */
    public function conflitALaConfirmation(Booking $booking): ?array
    {
        $nuits = app(PropertyAvailabilityService::class)->refus($booking->property_id, $booking->start_date, $booking->end_date, $booking);
        if ($nuits !== null) {
            return [422, $nuits];
        }

        if ($booking->kind !== BookingKind::Application) {
            return null;
        }

        $autreAcceptee = Booking::query()
            ->where('property_id', $booking->property_id)
            ->where('kind', BookingKind::Application->value)
            ->where('status', BookingStatus::Confirmed->value)
            ->whereKeyNot($booking->getKey())
            ->exists();
        if ($autreAcceptee) {
            return [409, 'booking.application_already_accepted'];
        }

        return BookingService::bauxQuiOccupent($booking)->exists() ? [409, 'booking.property_already_leased'] : null;
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
