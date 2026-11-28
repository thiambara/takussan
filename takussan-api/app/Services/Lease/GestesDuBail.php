<?php

namespace App\Services\Lease;

use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Inventory;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeaseSignature;
use App\Models\User;
use App\Policies\LeasePolicy;
use App\Services\Model\LeasePaymentService;
use App\Services\Model\LeaseService;

/**
 * TCK-3011 (ADR-0139) — les gestes d'un bail : pour chacun, « possible MAINTENANT pour ce lecteur »,
 * policy ET état compris. `LeaseResource::forViewer` en tire `abilities` ; la fiche
 * (`components/leases/fiche/gestes.ts`) n'y ajoute plus le statut. Avant, les clés étaient « policy
 * seule » (P152.02 : « le statut du bail reste jugé par l'écran et l'API ») et l'écran refaisait la
 * précondition de chaque service, parfois autrement que lui — « Réviser » sur une vente que l'API
 * refuse faute de loyer, « Restituer » sur une caution jamais encaissée, « Générer l'échéancier » sur
 * un échéancier de caution seule.
 *
 * Les prédicats d'état sont ceux que les services relisent sur la ligne VERROUILLÉE
 * ({@see self::renouvelable()}, {@see self::revisable()}, {@see self::enFinDeBail()},
 * {@see self::preavisPossible()}, {@see self::preavisEnCours()}, {@see self::annulationDuPreavisOuverte()},
 * {@see self::ligneAjoutable()}, {@see self::echeancierEmis()}, {@see self::signatureDemandable()},
 * {@see self::renouvellementOuvert()}) : une règle d'état, une définition.
 *
 * Trois clés restent des repères plus que des gestes, lus comme tels par l'écran — `update` (le lecteur
 * gère le bail : le `PATCH` des termes non imprimés n'a pas de précondition d'état), `record_payment` (il
 * encaisse sur ce bail ; l'état se juge par échéance, `LeasePaymentResource`) et `give_notice` (il est le
 * locataire, décision 12 de TCK-2645). Ce qui dépend d'une saisie que la fiche permet de corriger (le
 * locataire sans compte ou sans nom de l'envoi en signature) reste un refus que l'écran explique.
 *
 * Coût : servi par la fiche et les réponses de ses gestes seulement, jamais en liste (ADR-0139 § 5). Les
 * jugements qui lisent la base ne s'évaluent qu'après la policy et le statut qui les rendent pertinents.
 */
final class GestesDuBail
{
    /** Les clés d'`abilities`, dans leur ordre de service. */
    public const GESTES = [
        'renew', 'review_rent', 'record_payment', 'add_payment', 'generate_schedule', 'refund_deposit',
        'request_early_termination', 'cancel_early_termination', 'update', 'attach_guarantor', 'abandon',
        'request_signature', 'sign', 'add_document', 'download_contract', 'leave_review', 'give_notice',
        'rent_review_force',
    ];

    public function __construct(private readonly LeasePolicy $policy) {}

    /**
     * @return array<string, bool> une clé par {@see self::GESTES}
     */
    public function pour(User $lecteur, Lease $bail): array
    {
        return [
            'renew' => $this->peutRenouveler($lecteur, $bail),
            'review_rent' => $this->peutReviser($lecteur, $bail),
            'record_payment' => $lecteur->can('recordPayment', $bail),
            'add_payment' => $this->peutAjouterUneLigne($lecteur, $bail),
            'generate_schedule' => $this->peutGenererLEcheancier($lecteur, $bail),
            'refund_deposit' => $this->peutRestituerLaCaution($lecteur, $bail),
            'request_early_termination' => $this->peutDonnerPreavis($lecteur, $bail),
            'cancel_early_termination' => $this->peutAnnulerLePreavis($lecteur, $bail),
            'update' => $lecteur->can('update', $bail),
            'attach_guarantor' => $this->peutAjouterUnGarant($lecteur, $bail),
            'abandon' => $this->peutAbandonner($lecteur, $bail),
            'request_signature' => $this->peutDemanderLaSignature($lecteur, $bail),
            'sign' => $this->peutSigner($lecteur, $bail),
            'add_document' => $lecteur->can('addDocument', $bail),
            'download_contract' => $lecteur->can('downloadContract', $bail),
            // TCK-2642 — des gestes de PARTIE (le locataire) : la policy en direct, hors de `Gate::before`,
            // qui les accorderait au super-admin. `leave_review` porte déjà son état (ReviewEligibility).
            'leave_review' => $this->policy->leaveReview($lecteur, $bail),
            'give_notice' => $this->policy->giveNotice($lecteur, $bail),
            'rent_review_force' => $this->peutPasserOutreAuPlafond($lecteur, $bail),
        ];
    }

    /**
     * Renouveler (`LeaseRenewalService::renew`) : un bail en cours ou échu, sans renouvellement encore
     * ouvert. Les parties parties (bien supprimé, bailleur parti) et la profondeur de chaîne restent des
     * refus de l'écriture : rares, et dits par leur code.
     */
    public function peutRenouveler(User $lecteur, Lease $bail): bool
    {
        return self::renouvelable($bail) && $lecteur->can('renew', $bail) && ! self::renouvellementOuvert($bail);
    }

    /** Réviser le loyer (`RentReviewService::review`) : un bail actif qui a un loyer de référence. */
    public function peutReviser(User $lecteur, Lease $bail): bool
    {
        return self::revisable($bail) && (float) ($bail->monthly_rent ?? 0) > 0 && $lecteur->can('reviewRent', $bail);
    }

    /** Poser une ligne (charges, régularisation, pénalité : `POST /api/leases/{id}/payments`) sur un bail qui court. */
    public function peutAjouterUneLigne(User $lecteur, Lease $bail): bool
    {
        return self::ligneAjoutable($bail) && $lecteur->can('recordPayment', $bail);
    }

    /** Générer l'échéancier (`LeaseService::generateSchedule`) : un bail actif dont aucun loyer n'est émis. */
    public function peutGenererLEcheancier(User $lecteur, Lease $bail): bool
    {
        return $bail->status === LeaseStatus::Active && $lecteur->can('recordPayment', $bail) && ! self::echeancierEmis($bail);
    }

    /**
     * Restituer la caution (`DepositRefundService::refund`) : un bail fini, une caution prévue, encaissée,
     * et dont il reste à rendre (`deposit_refund.no_deposit`, `…not_collected`, `…already_refunded`).
     */
    public function peutRestituerLaCaution(User $lecteur, Lease $bail): bool
    {
        return self::enFinDeBail($bail)
            && (float) ($bail->deposit_amount ?? 0) > 0
            && $lecteur->can('refundDeposit', $bail)
            && $bail->collectedDeposit() > 0
            && $bail->deposit_remaining > 0;
    }

    /** Donner préavis ou résilier (`EarlyTerminationService::request`) : un bail en cours ou échu, hors préavis. */
    public function peutDonnerPreavis(User $lecteur, Lease $bail): bool
    {
        return self::preavisPossible($bail) && $lecteur->can('requestEarlyTermination', $bail);
    }

    /**
     * Annuler le préavis (`EarlyTerminationService::cancel`) : en préavis, avant sa date d'effet, et tant
     * que l'indemnité n'est pas payée (`lease_early_termination_penalty_paid`).
     */
    public function peutAnnulerLePreavis(User $lecteur, Lease $bail): bool
    {
        if (! self::preavisEnCours($bail) || ! self::annulationDuPreavisOuverte($bail) || ! $lecteur->can('cancelEarlyTermination', $bail)) {
            return false;
        }

        return $bail->early_termination_invoice_id === null
            || Invoice::query()->whereKey($bail->early_termination_invoice_id)->value('status') !== InvoiceStatus::Paid->value;
    }

    /**
     * TCK-607 (n3) — ajouter un garant : la règle d'`update`, plus `Lease::acceptsGuarantorChange` (figés
     * sur un bail signé, sauf le premier d'un enfant de renouvellement), que l'API rejuge sous verrou.
     */
    public function peutAjouterUnGarant(User $lecteur, Lease $bail): bool
    {
        return $lecteur->can('update', $bail) && $bail->acceptsGuarantorChange(self::nombreDeGarants($bail), attaching: true);
    }

    /**
     * TCK-2764 — abandonner le brouillon (`LeaseService::abandonDraft`) : `LeasePolicy::abandon` (un
     * brouillon), sans échéance saisie (`lease.abandon_has_payments`) ni état des lieux engagé
     * (`lease.abandon_has_inventory`). La fiche dit pourquoi quand elle ne l'offre pas (`has_inventory`).
     */
    public function peutAbandonner(User $lecteur, Lease $bail): bool
    {
        return $lecteur->can('abandon', $bail)
            && ! $bail->payments()->where('status', '!=', PaymentStatus::Cancelled->value)->exists()
            && ! $bail->inventories()->get()->contains(fn (Inventory $etat): bool => $etat->engage());
    }

    /** Envoyer (ou renvoyer) en signature (`LeaseSignatureService::request`) : un brouillon ou un bail qui l'attend. */
    public function peutDemanderLaSignature(User $lecteur, Lease $bail): bool
    {
        return self::signatureDemandable($bail) && $lecteur->can('requestSignature', $bail);
    }

    /**
     * Signer (`LeaseSignatureService::sign`) : un contrat figé qui attend, pour un rôle que le lecteur tient
     * ({@see LeaseSignatureService::rolesFor()}) et qu'il n'a pas encore signé sur ce contrat
     * (`lease_signature.not_requested`, `…already_signed`).
     */
    public function peutSigner(User $lecteur, Lease $bail): bool
    {
        if ($bail->status !== LeaseStatus::PendingSignature || $bail->contract_sha256 === null) {
            return false;
        }
        $roles = LeaseSignatureService::rolesFor($lecteur, $bail);
        if ($roles === []) {
            return false;
        }
        $signes = ($bail->relationLoaded('signatures') ? $bail->signatures : $bail->signatures()->get())
            ->filter(fn (LeaseSignature $s): bool => $s->document_sha256 === $bail->contract_sha256)
            ->pluck('role')
            ->all();

        return array_diff($roles, $signes) !== [];
    }

    /**
     * TCK-2645 (décision 3) — « Passer outre » le plafond de révision : la capacité jugée dans l'agence DU
     * BAIL (sans agence, seul le super-admin, réserve r1 d'eecb6f893), sur un plafond NON figé au contrat
     * (`lease.rent_review_above_contract_cap`).
     */
    public function peutPasserOutreAuPlafond(User $lecteur, Lease $bail): bool
    {
        return $bail->rent_review_max_pct === null
            && ($bail->agency_id !== null ? $lecteur->can('leases.rent_review_force', $bail) : $lecteur->isSuperAdmin());
    }

    /* ─────────────── Les prédicats d'état, relus par les services sous leur verrou ─────────────── */

    /** `LeaseRenewalService::guardParentStatus` — `lease_renewal_status_not_renewable`. */
    public static function renouvelable(Lease $bail): bool
    {
        return in_array($bail->status, LeaseRenewalService::RENEWABLE_PARENT_STATUSES, true);
    }

    /**
     * TCK-1804 (P162.07) — un renouvellement encore ouvert (en cours, préavis compris, ou brouillon) arrête
     * le suivant (`LeaseRenewalService::guardNoActiveChild`).
     */
    public static function renouvellementOuvert(Lease $bail): bool
    {
        return Lease::query()
            ->where('renewed_from_lease_id', $bail->getKey())
            ->whereIn('status', [...Lease::OPEN_STATUSES, LeaseStatus::Draft->value])
            ->exists();
    }

    /** `RentReviewService::review` — `lease_rent_review_status_not_reviewable`. */
    public static function revisable(Lease $bail): bool
    {
        return in_array($bail->status, RentReviewService::REVIEWABLE_STATUSES, true);
    }

    /** `DepositRefundService::refund` — `deposit_refund.lease_not_ended`. */
    public static function enFinDeBail(Lease $bail): bool
    {
        return in_array($bail->status, [LeaseStatus::Terminated, LeaseStatus::Expired], true);
    }

    /** `EarlyTerminationService::guardRequestable` — hors préavis, un bail en cours ou échu. */
    public static function preavisPossible(Lease $bail): bool
    {
        return in_array($bail->status, EarlyTerminationService::REQUESTABLE_STATUSES, true);
    }

    /** `EarlyTerminationService::cancel` — `lease_early_termination_not_in_progress`. */
    public static function preavisEnCours(Lease $bail): bool
    {
        return $bail->status === LeaseStatus::Terminating;
    }

    /** `EarlyTerminationService::cancel` — `lease_early_termination_window_closed` : avant la date d'effet. */
    public static function annulationDuPreavisOuverte(Lease $bail): bool
    {
        return $bail->early_termination_effective_date === null
            || $bail->early_termination_effective_date->copy()->startOfDay()->gt(now()->startOfDay());
    }

    /**
     * P46.04 (TCK-957) — une ligne ne se pose que sur un bail qui court : actif, ou en préavis
     * (`lease_payment.lease_not_active`, {@see LeasePaymentService::create()}).
     */
    public static function ligneAjoutable(Lease $bail): bool
    {
        return in_array($bail->status, [LeaseStatus::Active, LeaseStatus::Terminating], true);
    }

    /**
     * P46.04 (TCK-957) — l'échéancier existe si le bail a des loyers non annulés : une caution saisie avant
     * l'activation n'en est pas un ({@see LeaseService::generateSchedule()}).
     */
    public static function echeancierEmis(Lease $bail): bool
    {
        return $bail->payments()
            ->where('payment_type', LeasePaymentType::Rent->value)
            ->where('status', '!=', PaymentStatus::Cancelled->value)
            ->exists();
    }

    /** `LeaseSignatureService::request` — `lease_signature.not_requestable`. */
    public static function signatureDemandable(Lease $bail): bool
    {
        return in_array($bail->status, [LeaseStatus::Draft, LeaseStatus::PendingSignature], true);
    }

    /** TCK-607 — le compte des garants : la relation chargée, le `withCount`, sinon une requête. */
    private static function nombreDeGarants(Lease $bail): int
    {
        if ($bail->relationLoaded('guarantors')) {
            return $bail->guarantors->count();
        }

        return (int) ($bail->guarantors_count ?? $bail->guarantors()->count());
    }
}
