<?php

namespace App\Domain\Notifications;

use App\Domain\Integrations\Providers\IntegrationProvider;
use App\Models\Enums\NotificationType;
use App\Services\Model\NotificationService;
use App\Services\Notifications\NotificationRenderer;

/**
 * TCK-588 (ADR-0032) — le catalogue des notifications que l'API émet par code.
 *
 * Une notification n'est plus une phrase écrite par l'émetteur : c'est un code, des paramètres
 * bruts et une cible. Le texte se rend par surface (`title`, `body`, `mail_subject`,
 * `mail_body`, `sms`) dans la langue du DESTINATAIRE, depuis
 * `lang/{fr,en,wo}/notifications.php` → `codes.<code>.<surface>`
 * ({@see NotificationRenderer}), et la cloche le rend depuis le dictionnaire du front.
 *
 * Chaque cas déclare tout ce qu'un envoi doit savoir, pour qu'aucun appelant n'ait à le
 * redire — et à le redire faux, comme `TYPE_TO_EVENT` qui associait un TYPE à un interrupteur :
 *
 *   · {@see type()}            — le type métier de la ligne `app_notifications` ;
 *   · {@see preferenceEvent()} — l'interrupteur qui commande CE message (null : non désactivable) ;
 *   · {@see params()}          — le nom et la nature de chaque paramètre (formatage au rendu) ;
 *   · {@see mobile()}          — le code peut partir sur WhatsApp ou SMS ;
 *   · {@see reachesContacts()} — le code peut viser un contact sans compte (transactionnel) ;
 *   · {@see templateEvent()}   — l'événement de l'éditeur de gabarits du super-admin, s'il existe.
 *
 * Émission : {@see NotificationService::send()}.
 */
enum NotificationCode: string
{
    // ─── Loyers ─────────────────────────────────────────────────────────────────────────
    case LeasePaymentDueSoon = 'lease_payment.due_soon';
    case LeasePaymentOverdue = 'lease_payment.overdue';
    case LeasePaymentOverdueLandlord = 'lease_payment.overdue_landlord';
    case LeasePaymentOverdueDigest = 'lease_payment.overdue_digest';
    case LeasePaymentRecorded = 'lease_payment.recorded';
    case LeasePaymentReceivedLandlord = 'lease_payment.received_landlord';
    // TCK-602 (ADR-0051 §2) — la quittance d'un paiement en ligne, au locataire même sans compte.
    case LeasePaymentSettledOnline = 'lease_payment.settled_online';
    // TCK-2320 (P39.07) — un remboursement du fournisseur sur un loyer encaissé en ligne : le
    // locataire, même sans compte (sa quittance ne couvre plus la somme rendue), et le bailleur.
    case LeasePaymentRefunded = 'lease_payment.refunded';
    case LeasePaymentRefundedLandlord = 'lease_payment.refunded_landlord';
    // TCK-2793 — la pénalité de retard payée SEULE (TCK-2778), remboursée : les textes du loyer
    // disent « loyer ».
    case LeasePaymentLateFeeRefunded = 'lease_payment.late_fee_refunded';
    case LeasePaymentLateFeeRefundedLandlord = 'lease_payment.late_fee_refunded_landlord';

    // ─── Encaissements en ligne (TCK-593) ───────────────────────────────────────────────
    case PaymentDuplicate = 'payment.duplicate';
    case PaymentDuplicateLateFee = 'payment.duplicate_late_fee';
    // TCK-2320 (P39.07) — aux admins de l'agence : une ligne d'un reversement de la plateforme déjà
    // versé a été remboursée depuis. Aucun montant : la compensation n'est pas décidée.
    case PlatformPayoutRefundedSincePaid = 'platform_payout.refunded_since_paid';

    // ─── Réservations ───────────────────────────────────────────────────────────────────
    case BookingCreated = 'booking.created';

    /** TCK-596 — une demande sans dates (offre d'achat, demande privée non datée) : « du … au … » vide sinon. */
    case BookingRequestedUndated = 'booking.requested_undated';
    case BookingConfirmed = 'booking.confirmed';
    case BookingRejected = 'booking.rejected';
    case BookingCancelled = 'booking.cancelled';
    // TCK-2579 (ADR-0102 §2) — au CLIENT : le personnel de l'agence a enregistré une candidature ou
    // une offre en son nom ; il peut l'annuler. Son compte, sinon le téléphone de sa fiche.
    case BookingRecordedOnBehalf = 'booking.recorded_on_behalf';
    // TCK-2734 (seconde porte, décision du porteur du 2026-11-12) — au CLIENT : un bail a été créé
    // sur le bien pour un autre locataire ; sa candidature, en attente ou acceptée, est close.
    case BookingApplicationNotSelected = 'booking.application_not_selected';

    // ─── Visites, messages, leads ───────────────────────────────────────────────────────
    case VisitReminder = 'visit.reminder';
    case MessageReceived = 'message.received';
    /** TCK-861 (P38.07) — un membre ajouté à un groupe : la cloche ouvre le groupe. */
    case MessageGroupInvite = 'message.group_invite';
    case LeadReceived = 'lead.received';

    // ─── Visites et demandes de contact (TCK-590) ───────────────────────────────────────
    // Vers l'agence : une demande, un créneau proposé ou une annulation par le visiteur.
    case VisitRequested = 'visit.requested';
    /** TCK-2502 — une demande par jour et tranche (« mardi après-midi ») : l'heure est à fixer. */
    case VisitRequestedWindow = 'visit.requested_window';
    case VisitRescheduledByVisitor = 'visit.rescheduled_by_visitor';
    case VisitCancelledByVisitor = 'visit.cancelled_by_visitor';
    /** TCK-2502 — le visiteur annule une visite demandée par tranche, heure jamais fixée. */
    case VisitCancelledByVisitorWindow = 'visit.cancelled_by_visitor_window';
    // Vers le visiteur, compte ou contact sans compte : un geste HUMAIN de l'agence.
    case VisitConfirmed = 'visit.confirmed';
    case VisitRescheduled = 'visit.rescheduled';
    case VisitCancelled = 'visit.cancelled';
    /** TCK-2502 — l'agence annule une visite demandée par tranche, heure jamais fixée. */
    case VisitCancelledWindow = 'visit.cancelled_window';
    // Vers le visiteur qui a laissé un e-mail : l'accusé de réception de sa demande.
    case LeadAcknowledged = 'lead.acknowledged';

    // ─── KYC d'agence ───────────────────────────────────────────────────────────────────
    case KycSubmitted = 'kyc.submitted';
    case KycVerified = 'kyc.verified';
    case KycRejected = 'kyc.rejected';
    // TCK-601 — la pièce du dirigeant arrive à échéance (J-30, J-7).
    case KycExpiringSoon = 'kyc.expiring_soon';

    // ─── Documents ──────────────────────────────────────────────────────────────────────
    // TCK-2783 — une pièce datée arrive à échéance (J-60, J-7, au jour de Dakar) : à son porteur
    // `User` (« Mes pièces »), sinon à son téléverseur s'il la lit encore (`DocumentExpiryReminder`).
    case DocumentExpiringSoon = 'document.expiring_soon';

    // ─── Gouvernance d'agence (TCK-601) : aux admins actifs, sauf l'auteur ───────────────
    case GovernanceRoleCapabilitiesChanged = 'governance.role_capabilities_changed';
    case GovernanceAdminAdded = 'governance.admin_added';
    case GovernanceDataExported = 'governance.data_exported';
    case GovernanceIntegrationChanged = 'governance.integration_changed';
    case GovernanceApprovalThresholdChanged = 'governance.approval_threshold_changed';

    // ─── Délégations de rôle ────────────────────────────────────────────────────────────
    case RoleDelegationActivated = 'role_delegation.activated';
    case RoleDelegationActivatedDelegator = 'role_delegation.activated_delegator';
    case RoleDelegationExpired = 'role_delegation.expired';
    case RoleDelegationExpiredDelegator = 'role_delegation.expired_delegator';
    case RoleDelegationRevoked = 'role_delegation.revoked';
    case RoleDelegationRevokedDelegator = 'role_delegation.revoked_delegator';

    // ─── Relevés bancaires ──────────────────────────────────────────────────────────────
    case BankStatementImported = 'bank_statement.imported';
    case BankStatementFinalized = 'bank_statement.finalized';

    // ─── Maintenance ────────────────────────────────────────────────────────────────────
    case MaintenanceCreated = 'maintenance.created';
    case MaintenanceQuoteRequested = 'maintenance_quote.requested';
    case MaintenanceQuoteSubmitted = 'maintenance_quote.submitted';
    case MaintenanceQuoteApproved = 'maintenance_quote.approved';
    case MaintenanceQuoteRejected = 'maintenance_quote.rejected';

    // TCK-592 — le cycle de l'intervention, chacun à qui il regarde (NotifyMaintenanceParticipants).
    case MaintenanceAssigned = 'maintenance.assigned';
    case MaintenanceUnassigned = 'maintenance.unassigned';
    case MaintenanceAccepted = 'maintenance.accepted';
    case MaintenanceDeclined = 'maintenance.declined';
    case MaintenanceCompleted = 'maintenance.completed';
    case MaintenanceConfirmed = 'maintenance.confirmed';
    case MaintenanceContested = 'maintenance.contested';
    case MaintenanceAutoClosed = 'maintenance.auto_closed';
    case MaintenanceCancelled = 'maintenance.cancelled';
    case MaintenanceStepAcknowledged = 'maintenance.step_acknowledged';
    case MaintenanceStepAssigned = 'maintenance.step_assigned';
    case MaintenanceStepInProgress = 'maintenance.step_in_progress';
    case MaintenanceStepCompleted = 'maintenance.step_completed';
    case MaintenanceStepClosed = 'maintenance.step_closed';
    case MaintenanceStepCancelled = 'maintenance.step_cancelled';
    case MaintenanceStepAcknowledgedScheduled = 'maintenance.step_acknowledged_scheduled';
    case MaintenanceStepAssignedScheduled = 'maintenance.step_assigned_scheduled';
    case MaintenanceStepInProgressScheduled = 'maintenance.step_in_progress_scheduled';
    case MaintenanceQuoteAwaitingOwner = 'maintenance_quote.awaiting_owner';
    // TCK-2012 (P184.01) — le passage fixé ou déplacé par le `PATCH`, à toutes les parties sauf l'auteur.
    case MaintenanceScheduleChanged = 'maintenance.schedule_changed';
    // TCK-2786 — l'agence relance le bailleur d'une intervention qui attend sa décision (`awaiting_owner`).
    case MaintenanceOwnerReminder = 'maintenance.owner_reminder';

    // ─── CRM ───────────────────────────────────────────────────────────────────────────
    /** TCK-591 — le récapitulatif quotidien des biens qui correspondent aux prospects d'un référent. */
    case ProspectMatchDigest = 'prospect_match.digest';

    // ─── Modération des biens (envoyés par leurs classes Notification) ──────────────────
    case PropertyApproved = 'property.approved';
    case PropertyRejected = 'property.rejected';

    /** TCK-782 (P15.10) — un bien passe en `pending_review` : les admins actifs de son agence. */
    case PropertySubmittedForReview = 'property.submitted_for_review';

    /**
     * TCK-997 (Q6, ADR-0036 amendé le 2026-10-19) — un bien vient d'être saisi au nom du bailleur
     * (désignation, lot sous son bien, copie de son bien). Repris par TCK-999 et TCK-1000.
     */
    case PropertyAssignedToOwner = 'property.assigned_to_owner';

    /** TCK-596 (ADR-0041 §6) — un événement importé chevauche une réservation confirmée. */
    case PropertyCalendarConflict = 'property.calendar_conflict';

    /** TCK-596 (ADR-0041 §5) — un flux iCal importé échoue pour la troisième fois d'affilée. */
    case PropertyCalendarFeedFailing = 'property.calendar_feed_failing';

    /** TCK-596 (ADR-0042 §9) — le contrat est figé : chaque partie a son bail à signer. */
    case LeaseSignatureRequested = 'lease.signature_requested';

    /** TCK-596 (ADR-0042 §9) — une partie a signé ; l'autre en est prévenue. */
    case LeaseSignedByParty = 'lease.signed_by_party';

    /** TCK-596 (ADR-0042 §9) — la seconde signature a activé le bail. */
    case LeaseSignatureCompleted = 'lease.signature_completed';

    /** TCK-2642 — le loyer d'un bail a été révisé : le bailleur en est prévenu, comme le locataire. */
    case LeaseRentReviewedLandlord = 'lease.rent_reviewed_landlord';

    // ─── Sorties d'argent (TCK-594, ADR-0039) ───────────────────────────────────────────
    case PayoutAwaitingApproval = 'payout.awaiting_approval';
    case PayoutDue = 'payout.due';
    case PayoutProcessed = 'payout.processed';
    /**
     * TCK-2661 (ADR-0049 §3) — au bénéficiaire : une ligne de commission, ou un solde groupé de ses
     * lignes, lui a été payé. Une notification par geste, pour le total (`count`, `amount`).
     */
    case CommissionPaid = 'commission.paid';
    case PayoutFailed = 'payout.failed';
    case PayoutMethodAdded = 'payout_method.added';
    case PayoutMethodUpdated = 'payout_method.updated';
    case PayoutMethodRemoved = 'payout_method.removed';
    case PayoutThresholdRelaxRequested = 'payout_threshold.relax_requested';
    /**
     * TCK-2270 (P224.01, ADR-0039 § 8, amendement du 2026-10-25) — à qui gère les factures de
     * l'agence (`payouts.create`) : l'intervention est contestée ou annulée, et sa facture, déjà
     * payée, imputée ou en cours de paiement, n'est pas annulée.
     */
    case ServiceProviderBillKeptOnReopen = 'service_provider_bill.kept_on_reopen';
    case OwnerStatementAvailable = 'owner_statement.available';

    // ─── Avis et signalements (TCK-597, ADR-0043) ───────────────────────────────────────
    case ReviewToModerate = 'review.to_moderate';
    case ReviewReceived = 'review.received';
    case ModerationPropertyHidden = 'moderation.property_hidden';
    case ModerationPropertyRemoved = 'moderation.property_removed';
    case ModerationReportUpheld = 'moderation.report_upheld';
    case ModerationReportDismissed = 'moderation.report_dismissed';

    // ─── Invitations par SMS (TCK-589 : le destinataire n'a souvent pas de compte) ───────
    case InvitationReceived = 'invitation.received';
    case InvitationReminder = 'invitation.reminder';
    /** TCK-2609 — à l'invitant : l'invité dont le lien a expiré demande un nouveau lien (ADR-0094 §3). */
    case InvitationRenewalRequested = 'invitation.renewal_requested';

    // ─── Sécurité du compte (TCK-589 p3-1 : avis à l'ANCIEN numéro, qui n'a plus de compte) ─
    case AccountPhoneChanged = 'account.phone_changed';

    // ─── Console plateforme (TCK-600) ───────────────────────────────────────────────────
    /** À la cible, à la fermeture d'une session d'impersonation, quelle qu'en soit la cause (ADR-0055). */
    case ImpersonationEnded = 'impersonation.ended';
    /** Aux admins de l'agence (ADR-0048). */
    case AgencySuspended = 'agency.suspended';
    case AgencyReinstated = 'agency.reinstated';
    /** TCK-2164 (P204.01) — aux admins de l'agence : un membre du personnel a demandé l'effacement de son compte. */
    case AgencyMemberDeletionRequested = 'agency.member_deletion_requested';
    /** Au compte bloqué ou réactivé depuis la console. */
    case AccountBlocked = 'account.blocked';
    case AccountReactivated = 'account.reactivated';
    /** Aux admins de l'agence : un bien dépublié parce que son seul contact a été effacé. */
    case PropertyUnpublishedContactErased = 'property.unpublished_contact_erased';
    /** Aux autres `super_admin` : un opérateur a été retiré (ADR-0047). */
    case PlatformOperatorRevoked = 'platform_operator.revoked';

    // ─── Radar (TCK-2432) ───────────────────────────────────────────────────────────────
    /** Au titulaire d'un bien publié par le Radar : sa dernière annonce source a disparu — le bien est-il toujours disponible ? */
    case PropertySourceListingGone = 'property.source_listing_gone';

    // ─── Avis qui n'avaient pas de code (TCK-2704) ──────────────────────────────────────
    /** Au titulaire du bien : une Vedette ou un Badge a pris fin (`Boost\BoostEndedNotification`). */
    case BoostEnded = 'boost.ended';
    /** Aux admins actifs de l'agence : un bailleur rattaché propose un bien (`PropertyProposedNotification`, ADR-0031). */
    case PropertyProposed = 'property.proposed';
    /** À l'agence : une intervention urgente créée, ou passée en urgent (`UrgentMaintenanceCreatedNotification`). */
    case MaintenanceUrgentCreated = 'maintenance.urgent_created';
    /** À l'agence : l'intervention urgente n'a pas été prise en charge à temps (`EscalateUrgentMaintenanceJob`). */
    case MaintenanceUrgentEscalated = 'maintenance.urgent_escalated';
    /** Aux super-admins : une agence individuelle demande à passer en agence professionnelle (TCK-267). */
    case AgencyUpgradeRequested = 'agency.upgrade_requested';

    /** Les natures de paramètre, chacune formatée à sa façon au rendu. */
    public const PARAM_MONEY = 'money';

    public const PARAM_DATE = 'date';

    public const PARAM_DATETIME = 'datetime';

    public const PARAM_COUNT = 'count';

    public const PARAM_TEXT = 'text';

    /** Un lien : jamais tronqué, contrairement à un texte dans un SMS. */
    public const PARAM_URL = 'url';

    /**
     * TCK-597 (verif-597 m5) — un motif de modération CODÉ (`ModerationReasonCode`), traduit au
     * rendu sous `moderation.reasons.<code>`, suivi du texte libre `reason` s'il y en a un.
     */
    public const PARAM_REASON_CODE = 'reason_code';

    /**
     * TCK-1322 (P128.02) — un rôle délégable CODÉ (`agency_admin`, `agent`, `owner`), traduit au
     * rendu sous `invitations.roles.<code>` ; un code sans libellé est rendu tel quel.
     */
    public const PARAM_ROLE = 'role';

    /**
     * P164.01 (TCK-1468) — un fournisseur d'intégration CODÉ (`orange_money`, `wave`…), rendu par
     * son libellé ({@see IntegrationProvider::label()}) ; le code reste rangé tel quel.
     */
    public const PARAM_PROVIDER = 'provider';

    /**
     * P164.02 (TCK-1470) — un mois rangé `Y-m` (`2026-09`), rendu en mois écrit dans la langue du
     * destinataire (« septembre 2026 ») ; une valeur d'une autre forme est rendue telle quelle.
     */
    public const PARAM_MONTH = 'month';

    /**
     * P235.03 (TCK-2369) — le nom d'une PERSONNE (le locataire d'un avis au bailleur, le bénéficiaire
     * d'une délégation). Vide — compte ou fiche créés par téléphone —, il se rend par le libellé
     * traduit `notifications.unnamed_person`, jamais par « — » ni par un numéro, même masqué.
     */
    public const PARAM_PERSON = 'person';

    /**
     * TCK-2502 — une tranche de la journée CODÉE (`morning`, `afternoon`, `evening` :
     * `VisitWindow`), traduite au rendu sous `visits.windows.<code>`. La cloche du front ne connaît
     * pas cette nature : elle reçoit le code brut, que son texte ICU lit par un `select`.
     */
    public const PARAM_VISIT_WINDOW = 'visit_window';

    public function type(): NotificationType
    {
        return match ($this) {
            self::LeasePaymentDueSoon, self::LeasePaymentOverdue, self::LeasePaymentOverdueLandlord,
            self::LeasePaymentOverdueDigest, self::LeasePaymentRecorded,
            self::LeasePaymentReceivedLandlord, self::LeasePaymentSettledOnline, self::PaymentDuplicate,
            self::PaymentDuplicateLateFee, self::LeasePaymentRefunded, self::LeasePaymentRefundedLandlord,
            self::LeasePaymentLateFeeRefunded, self::LeasePaymentLateFeeRefundedLandlord,
            self::PlatformPayoutRefundedSincePaid => NotificationType::Payment,
            self::BookingCreated, self::BookingRequestedUndated, self::BookingConfirmed, self::BookingRejected,
            self::BookingCancelled,
            self::BookingRecordedOnBehalf /* TCK-2579 */,
            self::BookingApplicationNotSelected /* TCK-2734 */ => NotificationType::Booking,
            self::VisitReminder, self::VisitRequested, self::VisitRequestedWindow, self::VisitRescheduledByVisitor,
            self::VisitCancelledByVisitor, self::VisitConfirmed, self::VisitRescheduled,
            self::VisitCancelled, self::VisitCancelledWindow, self::VisitCancelledByVisitorWindow => NotificationType::Visit,
            self::MessageReceived, self::MessageGroupInvite, self::LeadReceived, self::LeadAcknowledged => NotificationType::Message,
            self::RoleDelegationActivated, self::RoleDelegationActivatedDelegator => NotificationType::RoleDelegated,
            self::RoleDelegationExpired, self::RoleDelegationExpiredDelegator => NotificationType::RoleDelegationExpired,
            self::RoleDelegationRevoked, self::RoleDelegationRevokedDelegator => NotificationType::RoleDelegationRevoked,
            self::BankStatementImported => NotificationType::BankStatementImported,
            self::BankStatementFinalized => NotificationType::BankStatementFinalized,
            self::MaintenanceCreated, self::MaintenanceQuoteRequested, self::MaintenanceQuoteSubmitted,
            self::MaintenanceQuoteApproved, self::MaintenanceQuoteRejected => NotificationType::Maintenance,
            self::MaintenanceAssigned, self::MaintenanceUnassigned, self::MaintenanceAccepted, self::MaintenanceDeclined, self::MaintenanceCompleted, self::MaintenanceConfirmed, self::MaintenanceContested, self::MaintenanceAutoClosed, self::MaintenanceCancelled, self::MaintenanceStepAcknowledged, self::MaintenanceStepAssigned, self::MaintenanceStepInProgress, self::MaintenanceStepCompleted, self::MaintenanceStepClosed, self::MaintenanceStepCancelled, self::MaintenanceStepAcknowledgedScheduled, self::MaintenanceStepAssignedScheduled, self::MaintenanceStepInProgressScheduled, self::MaintenanceQuoteAwaitingOwner, self::MaintenanceScheduleChanged, self::MaintenanceOwnerReminder => NotificationType::Maintenance,
            self::KycSubmitted, self::KycVerified, self::KycRejected, self::KycExpiringSoon,
            self::DocumentExpiringSoon /* TCK-2783 */,
            self::GovernanceRoleCapabilitiesChanged, self::GovernanceAdminAdded, self::GovernanceDataExported,
            self::GovernanceIntegrationChanged, self::GovernanceApprovalThresholdChanged,
            self::PropertyApproved, self::PropertyRejected, self::PropertySubmittedForReview,
            self::PropertyAssignedToOwner,
            self::ReviewToModerate, self::ReviewReceived,
            self::ModerationPropertyHidden, self::ModerationPropertyRemoved,
            self::ModerationReportUpheld, self::ModerationReportDismissed,
            self::InvitationReceived, self::InvitationReminder,
            self::AccountPhoneChanged => NotificationType::System,
            // TCK-2609
            self::InvitationRenewalRequested => NotificationType::System,
            self::ImpersonationEnded, self::AgencySuspended, self::AgencyReinstated,
            self::AccountBlocked, self::AccountReactivated, self::PropertyUnpublishedContactErased,
            self::PlatformOperatorRevoked, self::AgencyMemberDeletionRequested => NotificationType::System,
            self::ProspectMatchDigest => NotificationType::System,
            self::PropertyCalendarConflict, self::PropertyCalendarFeedFailing => NotificationType::System,
            self::LeaseSignatureRequested, self::LeaseSignedByParty,
            self::LeaseSignatureCompleted => NotificationType::Lease,
            self::LeaseRentReviewedLandlord /* TCK-2642 */ => NotificationType::Lease,
            self::PayoutAwaitingApproval, self::PayoutDue, self::PayoutProcessed, self::PayoutFailed,
            self::PayoutMethodAdded, self::PayoutMethodUpdated, self::PayoutMethodRemoved,
            self::PayoutThresholdRelaxRequested, self::OwnerStatementAvailable,
            self::ServiceProviderBillKeptOnReopen, self::CommissionPaid => NotificationType::Payment,
            self::PropertySourceListingGone => NotificationType::System,
            // TCK-2704 — le type que la classe écrivait déjà.
            self::BoostEnded, self::PropertyProposed, self::AgencyUpgradeRequested => NotificationType::System,
            self::MaintenanceUrgentCreated, self::MaintenanceUrgentEscalated => NotificationType::Maintenance,
        };
    }

    /**
     * L'interrupteur qui commande CE message — il suit le message, jamais son type : la
     * confirmation d'une réservation obéit à « statut de réservation », pas à « nouvelle
     * demande ». Null : non désactivable.
     */
    public function preferenceEvent(): ?string
    {
        return match ($this) {
            self::LeasePaymentDueSoon => 'lease_payment_due',
            self::LeasePaymentOverdue, self::LeasePaymentOverdueLandlord,
            self::LeasePaymentOverdueDigest => 'lease_payment_overdue',
            self::LeasePaymentRecorded, self::LeasePaymentReceivedLandlord,
            self::LeasePaymentSettledOnline => 'lease_payment_received',
            // TCK-2642 — l'interrupteur de l'avis du locataire (`LeaseRentReviewedNotification`).
            self::LeaseRentReviewedLandlord => 'lease_rent_reviewed',
            self::BookingCreated, self::BookingRequestedUndated => 'booking_request',
            self::BookingConfirmed, self::BookingRejected, self::BookingCancelled,
            self::BookingRecordedOnBehalf /* TCK-2579 : côté client, comme la suite de sa demande */,
            self::BookingApplicationNotSelected /* TCK-2734 : la suite de sa demande */ => 'booking_status_changed',
            // TCK-590 — tous les événements d'une visite obéissent au même interrupteur (TCK-070).
            self::VisitReminder, self::VisitRequested, self::VisitRequestedWindow, self::VisitRescheduledByVisitor,
            self::VisitCancelledByVisitor, self::VisitConfirmed, self::VisitRescheduled,
            self::VisitCancelled, self::VisitCancelledWindow, self::VisitCancelledByVisitorWindow => 'visit_reminder',
            self::ReviewToModerate, self::ReviewReceived => 'review_received',
            self::MessageReceived, self::MessageGroupInvite, self::LeadReceived => 'message_received',
            // Un accusé de réception à un contact sans compte : ni compte, ni préférence.
            self::LeadAcknowledged => null,
            self::KycSubmitted, self::KycVerified, self::KycRejected, self::KycExpiringSoon => 'kyc_status_changed',
            // TCK-2783 — son propre interrupteur : le rappel d'une pièce n'est pas un verdict KYC.
            self::DocumentExpiringSoon => 'document_expiring',
            // Une alerte de sécurité ne se désactive pas : c'est sa raison d'être.
            self::GovernanceRoleCapabilitiesChanged, self::GovernanceAdminAdded, self::GovernanceDataExported,
            self::GovernanceIntegrationChanged, self::GovernanceApprovalThresholdChanged => null,
            self::MaintenanceCreated, self::MaintenanceQuoteRequested, self::MaintenanceQuoteSubmitted,
            self::MaintenanceQuoteApproved, self::MaintenanceQuoteRejected => 'maintenance_status_changed',
            self::MaintenanceAssigned, self::MaintenanceUnassigned, self::MaintenanceAccepted, self::MaintenanceDeclined, self::MaintenanceCompleted, self::MaintenanceConfirmed, self::MaintenanceContested, self::MaintenanceAutoClosed, self::MaintenanceCancelled, self::MaintenanceStepAcknowledged, self::MaintenanceStepAssigned, self::MaintenanceStepInProgress, self::MaintenanceStepCompleted, self::MaintenanceStepClosed, self::MaintenanceStepCancelled, self::MaintenanceStepAcknowledgedScheduled, self::MaintenanceStepAssignedScheduled, self::MaintenanceStepInProgressScheduled, self::MaintenanceQuoteAwaitingOwner, self::MaintenanceScheduleChanged, self::MaintenanceOwnerReminder => 'maintenance_status_changed',
            self::RoleDelegationActivated, self::RoleDelegationActivatedDelegator,
            self::RoleDelegationExpired, self::RoleDelegationExpiredDelegator,
            self::RoleDelegationRevoked, self::RoleDelegationRevokedDelegator,
            self::BankStatementImported, self::BankStatementFinalized,
            self::PropertyApproved, self::PropertyRejected, self::ProspectMatchDigest,
            // TCK-782 — comme l'approbation et le refus : non désactivable.
            self::PropertySubmittedForReview,
            self::PropertyCalendarConflict, self::PropertyCalendarFeedFailing,
            self::LeaseSignatureRequested, self::LeaseSignedByParty, self::LeaseSignatureCompleted,
            // TCK-597 — le retrait d'une annonce et l'issue d'un signalement : non désactivables.
            self::ModerationPropertyHidden, self::ModerationPropertyRemoved,
            self::ModerationReportUpheld, self::ModerationReportDismissed,
            // TCK-593 — une somme à rembourser : l'admin ne peut pas s'en désabonner.
            self::PaymentDuplicate, self::PaymentDuplicateLateFee => null,
            // TCK-2320 — de l'argent rendu après coup : on ne s'en désabonne pas.
            self::LeasePaymentRefunded, self::LeasePaymentRefundedLandlord, self::PlatformPayoutRefundedSincePaid => null,
            self::LeasePaymentLateFeeRefunded, self::LeasePaymentLateFeeRefundedLandlord => null,
            // TCK-594 — une sortie d'argent n'a pas d'interrupteur : l'approbateur, le payeur et le
            // bénéficiaire en sont toujours avisés, et un changement de destination est le signal
            // d'un détournement (ADR-0039 §6).
            self::PayoutAwaitingApproval, self::PayoutDue, self::PayoutProcessed, self::PayoutFailed,
            self::PayoutMethodAdded, self::PayoutMethodUpdated, self::PayoutMethodRemoved,
            self::PayoutThresholdRelaxRequested, self::OwnerStatementAvailable,
            self::ServiceProviderBillKeptOnReopen => null,
            // TCK-2661 — comme le reversement effectué : le bénéficiaire en est toujours avisé.
            self::CommissionPaid => null,
            // TCK-997 — comme le relevé de gérance : le bien décide à qui vont des loyers.
            self::PropertyAssignedToOwner => null,
            self::InvitationReceived, self::InvitationReminder => null,
            // TCK-2609 — comme l'expiration de l'invitation (`InvitationExpiredNotification`) : une
            // demande d'un tiers qui attend un geste de l'invitant, non désactivable.
            self::InvitationRenewalRequested => null,
            // Un avis de sécurité : on ne s'en désabonne pas.
            self::AccountPhoneChanged => null,
            // TCK-600 — avis de la plateforme sur le compte ou l'agence : non désactivables.
            self::ImpersonationEnded, self::AgencySuspended, self::AgencyReinstated,
            self::AccountBlocked, self::AccountReactivated, self::PropertyUnpublishedContactErased,
            self::PlatformOperatorRevoked => null,
            // TCK-2164 — un portefeuille à passer avant l'effacement : non désactivable.
            self::AgencyMemberDeletionRequested => null,
            // TCK-2432 — une question de produit, pas un avis de sécurité : elle suit les préférences du titulaire.
            self::PropertySourceListingGone => 'property_availability_check',
            // TCK-2704 — la cloche de ces avis n'avait aucun interrupteur (canal `database` imposé,
            // celui de l'urgence « locked-on » dans `PreferenceResolver`) : elle n'en gagne pas.
            self::BoostEnded, self::PropertyProposed, self::AgencyUpgradeRequested,
            self::MaintenanceUrgentCreated, self::MaintenanceUrgentEscalated => null,
        };
    }

    /**
     * Les paramètres du code et leur nature. Une valeur `text` ne porte qu'une donnée saisie
     * par un utilisateur (titre, nom, extrait), jamais une phrase de l'API.
     *
     * @return array<string, self::PARAM_*>
     */
    public function params(): array
    {
        return match ($this) {
            self::LeasePaymentDueSoon => ['amount' => self::PARAM_MONEY, 'due_date' => self::PARAM_DATE, 'property' => self::PARAM_TEXT],
            self::LeasePaymentOverdue => ['amount' => self::PARAM_MONEY, 'days' => self::PARAM_COUNT, 'due_date' => self::PARAM_DATE, 'property' => self::PARAM_TEXT],
            self::LeasePaymentOverdueLandlord => ['amount' => self::PARAM_MONEY, 'days' => self::PARAM_COUNT, 'property' => self::PARAM_TEXT, 'tenant' => self::PARAM_PERSON],
            self::LeasePaymentOverdueDigest => ['count' => self::PARAM_COUNT, 'total' => self::PARAM_MONEY],
            self::LeasePaymentRecorded => ['amount' => self::PARAM_MONEY, 'property' => self::PARAM_TEXT],
            self::LeasePaymentReceivedLandlord => ['amount' => self::PARAM_MONEY, 'property' => self::PARAM_TEXT, 'tenant' => self::PARAM_PERSON],
            self::LeasePaymentSettledOnline => ['amount' => self::PARAM_MONEY, 'property' => self::PARAM_TEXT],
            self::PaymentDuplicate, self::PaymentDuplicateLateFee => ['amount' => self::PARAM_MONEY, 'reference' => self::PARAM_TEXT],
            self::LeasePaymentRefunded => ['amount' => self::PARAM_MONEY, 'property' => self::PARAM_TEXT],
            self::LeasePaymentRefundedLandlord => ['amount' => self::PARAM_MONEY, 'property' => self::PARAM_TEXT, 'tenant' => self::PARAM_PERSON],
            self::LeasePaymentLateFeeRefunded => ['amount' => self::PARAM_MONEY, 'property' => self::PARAM_TEXT],
            self::LeasePaymentLateFeeRefundedLandlord => ['amount' => self::PARAM_MONEY, 'property' => self::PARAM_TEXT, 'tenant' => self::PARAM_PERSON],
            self::PlatformPayoutRefundedSincePaid => ['period' => self::PARAM_MONTH, 'reference' => self::PARAM_TEXT],
            self::BookingCreated, self::BookingConfirmed, self::BookingRejected,
            self::BookingCancelled => ['reference' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT, 'start_date' => self::PARAM_DATE, 'end_date' => self::PARAM_DATE],
            self::BookingRequestedUndated => ['reference' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT],
            self::BookingRecordedOnBehalf /* TCK-2579 */,
            self::BookingApplicationNotSelected /* TCK-2734 */ => ['reference' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT],
            self::VisitReminder => ['property' => self::PARAM_TEXT, 'scheduled_at' => self::PARAM_DATETIME, 'window' => self::PARAM_TEXT],
            self::MessageReceived => ['sender' => self::PARAM_TEXT, 'excerpt' => self::PARAM_TEXT],
            self::MessageGroupInvite => ['inviter' => self::PARAM_TEXT, 'subject' => self::PARAM_TEXT],
            // TCK-590 — de quoi RÉPONDRE : le message entier et le moyen de joindre (téléphone ·
            // e-mail). L'extrait de 80 caractères sans téléphone disait qu'on avait été contacté.
            self::LeadReceived => ['name' => self::PARAM_TEXT, 'contact' => self::PARAM_TEXT, 'message' => self::PARAM_TEXT],
            // L'accusé ne recopie rien de ce que le visiteur a saisi : le bien, ou le nom de l'agent.
            self::LeadAcknowledged => ['about' => self::PARAM_TEXT],
            // `timezone` : le fuseau du destinataire, dans lequel `scheduled_at` est rendu — l'heure
            // d'une visite est toujours suivie de son fuseau (TCK-590, §6). Aucun texte libre du
            // visiteur, ni son message ni le nom qu'il a saisi (contrainte 4).
            self::VisitRequested => ['property' => self::PARAM_TEXT, 'scheduled_at' => self::PARAM_DATETIME, 'timezone' => self::PARAM_TEXT, 'contact' => self::PARAM_TEXT],
            // TCK-2502 — le JOUR (date seule, à Dakar) et la tranche ; aucune heure, elle est à fixer.
            self::VisitRequestedWindow => ['property' => self::PARAM_TEXT, 'date' => self::PARAM_DATE, 'window' => self::PARAM_VISIT_WINDOW, 'contact' => self::PARAM_TEXT],
            self::VisitCancelledWindow, self::VisitCancelledByVisitorWindow => ['property' => self::PARAM_TEXT, 'date' => self::PARAM_DATE, 'window' => self::PARAM_VISIT_WINDOW],
            self::VisitRescheduledByVisitor, self::VisitCancelledByVisitor,
            self::VisitConfirmed, self::VisitRescheduled, self::VisitCancelled => ['property' => self::PARAM_TEXT, 'scheduled_at' => self::PARAM_DATETIME, 'timezone' => self::PARAM_TEXT],
            self::KycSubmitted => ['agency' => self::PARAM_TEXT],
            self::KycVerified => [],
            self::KycRejected => ['reason' => self::PARAM_TEXT],
            self::KycExpiringSoon => ['expires_at' => self::PARAM_DATE],
            // TCK-2783 — `days_left` : les jours qui restent au jour de Dakar (60, 7, ou moins au rattrapage).
            self::DocumentExpiringSoon => ['document_name' => self::PARAM_TEXT, 'expires_at' => self::PARAM_DATE, 'days_left' => self::PARAM_COUNT],
            // P164.04 (TCK-1808) — le code du rôle système (`agency_admin`), ou le nom d'un rôle créé,
            // que le repli de `role()` rend tel quel.
            self::GovernanceRoleCapabilitiesChanged => ['role' => self::PARAM_ROLE, 'actor' => self::PARAM_TEXT],
            self::GovernanceAdminAdded => ['member' => self::PARAM_TEXT, 'actor' => self::PARAM_TEXT],
            self::GovernanceDataExported, self::GovernanceApprovalThresholdChanged => ['actor' => self::PARAM_TEXT],
            self::GovernanceIntegrationChanged => ['provider' => self::PARAM_PROVIDER, 'actor' => self::PARAM_TEXT],
            self::RoleDelegationActivated => ['role' => self::PARAM_ROLE, 'ends_at' => self::PARAM_DATE],
            self::RoleDelegationExpired, self::RoleDelegationRevoked => ['role' => self::PARAM_ROLE],
            self::RoleDelegationActivatedDelegator, self::RoleDelegationExpiredDelegator,
            self::RoleDelegationRevokedDelegator => ['role' => self::PARAM_ROLE, 'beneficiary' => self::PARAM_PERSON],
            self::BankStatementImported => ['bank' => self::PARAM_TEXT, 'lines' => self::PARAM_COUNT],
            self::BankStatementFinalized => ['period_start' => self::PARAM_DATE, 'period_end' => self::PARAM_DATE, 'confirmed' => self::PARAM_COUNT, 'total' => self::PARAM_COUNT],
            self::MaintenanceCreated => ['property' => self::PARAM_TEXT, 'reference' => self::PARAM_TEXT],
            self::MaintenanceQuoteRequested, self::MaintenanceQuoteApproved,
            self::MaintenanceUnassigned, self::MaintenanceCompleted, self::MaintenanceConfirmed,
            self::MaintenanceCancelled, self::MaintenanceStepAcknowledged, self::MaintenanceStepAssigned,
            self::MaintenanceStepInProgress, self::MaintenanceStepCompleted, self::MaintenanceStepClosed,
            self::MaintenanceStepCancelled => ['request' => self::PARAM_TEXT],
            self::MaintenanceQuoteRejected => ['request' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT],
            self::MaintenanceQuoteSubmitted, self::MaintenanceQuoteAwaitingOwner, self::MaintenanceOwnerReminder => ['request' => self::PARAM_TEXT, 'amount' => self::PARAM_MONEY],
            self::MaintenanceAssigned => ['request' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT],
            self::MaintenanceAccepted => ['request' => self::PARAM_TEXT, 'provider' => self::PARAM_TEXT],
            self::MaintenanceDeclined => ['request' => self::PARAM_TEXT, 'provider' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT],
            self::MaintenanceContested => ['request' => self::PARAM_TEXT, 'comment' => self::PARAM_TEXT],
            self::MaintenanceAutoClosed => ['request' => self::PARAM_TEXT, 'days' => self::PARAM_COUNT],
            self::MaintenanceStepAcknowledgedScheduled, self::MaintenanceStepAssignedScheduled,
            self::MaintenanceStepInProgressScheduled,
            self::MaintenanceScheduleChanged => ['request' => self::PARAM_TEXT, 'scheduled_at' => self::PARAM_DATETIME],
            self::PropertyApproved => ['property' => self::PARAM_TEXT],
            self::PropertySubmittedForReview => ['property' => self::PARAM_TEXT],
            self::PropertyAssignedToOwner => ['property' => self::PARAM_TEXT],
            self::PropertyRejected => ['property' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT],
            self::PropertyCalendarConflict => ['property' => self::PARAM_TEXT, 'feed' => self::PARAM_TEXT, 'start_date' => self::PARAM_DATE, 'end_date' => self::PARAM_DATE],
            self::PropertyCalendarFeedFailing => ['property' => self::PARAM_TEXT, 'feed' => self::PARAM_TEXT],
            self::LeaseSignatureRequested, self::LeaseSignatureCompleted => ['reference' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT],
            self::LeaseSignedByParty => ['reference' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT, 'signer' => self::PARAM_TEXT],
            // TCK-2642
            self::LeaseRentReviewedLandlord => ['reference' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT, 'old' => self::PARAM_MONEY, 'new' => self::PARAM_MONEY, 'effective_date' => self::PARAM_DATE],
            self::PayoutAwaitingApproval, self::PayoutDue => ['reference' => self::PARAM_TEXT, 'amount' => self::PARAM_MONEY],
            // `transaction` et `destination` (forme masquée) valent « — » pour un paiement en espèces.
            self::PayoutProcessed => ['reference' => self::PARAM_TEXT, 'amount' => self::PARAM_MONEY, 'transaction' => self::PARAM_TEXT, 'destination' => self::PARAM_TEXT],
            self::CommissionPaid => ['count' => self::PARAM_COUNT, 'amount' => self::PARAM_MONEY],
            self::PayoutFailed => ['reference' => self::PARAM_TEXT, 'amount' => self::PARAM_MONEY, 'reason' => self::PARAM_TEXT],
            self::PayoutMethodAdded, self::PayoutMethodUpdated, self::PayoutMethodRemoved => ['destination' => self::PARAM_TEXT],
            self::PayoutThresholdRelaxRequested => ['agency' => self::PARAM_TEXT],
            self::OwnerStatementAvailable => ['period' => self::PARAM_MONTH],
            self::ServiceProviderBillKeptOnReopen => ['reference' => self::PARAM_TEXT, 'amount' => self::PARAM_MONEY, 'request' => self::PARAM_TEXT],
            self::ReviewToModerate, self::ReviewReceived => ['subject' => self::PARAM_TEXT, 'rating' => self::PARAM_COUNT],
            self::ModerationPropertyHidden, self::ModerationPropertyRemoved => ['property' => self::PARAM_TEXT, 'reason_code' => self::PARAM_REASON_CODE, 'reason' => self::PARAM_TEXT],
            self::ModerationReportUpheld, self::ModerationReportDismissed => ['property' => self::PARAM_TEXT],
            // Le nom de l'agence seul, jamais un texte de l'invitant (vérification adverse m1).
            self::InvitationReceived, self::InvitationReminder => ['agency' => self::PARAM_TEXT, 'url' => self::PARAM_URL],
            // TCK-2609 — le contact invité est celui que l'invitant a saisi : il le lit en clair.
            self::InvitationRenewalRequested => ['invitee' => self::PARAM_TEXT, 'role' => self::PARAM_ROLE, 'url' => self::PARAM_URL],
            // Aucun paramètre : ni l'ancien ni le nouveau numéro dans un SMS adressé à l'ancien.
            self::AccountPhoneChanged => [],
            self::ProspectMatchDigest => ['properties' => self::PARAM_COUNT, 'prospects' => self::PARAM_COUNT],
            // TCK-600 — le motif est la saisie d'un opérateur, jamais une phrase de l'API.
            self::ImpersonationEnded => ['operator' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT, 'started_at' => self::PARAM_DATETIME, 'ended_at' => self::PARAM_DATETIME],
            self::AgencySuspended, self::AgencyReinstated => ['agency' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT],
            self::AccountBlocked, self::AccountReactivated => ['reason' => self::PARAM_TEXT],
            self::PropertyUnpublishedContactErased => ['property' => self::PARAM_TEXT, 'reference' => self::PARAM_TEXT, 'url' => self::PARAM_URL],
            self::AgencyMemberDeletionRequested => [
                'member' => self::PARAM_TEXT, 'scheduled_for' => self::PARAM_DATE,
                'tasks' => self::PARAM_COUNT, 'visits' => self::PARAM_COUNT, 'maintenance' => self::PARAM_COUNT,
                'responsible_properties' => self::PARAM_COUNT, 'held_properties' => self::PARAM_COUNT,
                'collaborations' => self::PARAM_COUNT, 'customers' => self::PARAM_COUNT,
                // TCK-2170 (P204.04)
                'contact_leads' => self::PARAM_COUNT, 'url' => self::PARAM_URL,
            ],
            self::PlatformOperatorRevoked => ['operator' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT],
            self::PropertySourceListingGone => ['property' => self::PARAM_TEXT],
            // TCK-2704
            self::BoostEnded, self::PropertyProposed => ['property' => self::PARAM_TEXT],
            self::MaintenanceUrgentCreated, self::MaintenanceUrgentEscalated => ['title' => self::PARAM_TEXT],
            self::AgencyUpgradeRequested => ['agency' => self::PARAM_TEXT],
        };
    }

    /**
     * Les paramètres FACULTATIFS : absents, la variante de clé sans eux s'applique. Le lien de
     * paiement d'une échéance (rempli par TCK-602) a sa variante `<surface>_link`.
     *
     * @return array<string, self::PARAM_*>
     */
    public function optionalParams(): array
    {
        return match ($this) {
            // TCK-2706 — `rent` et `charges` : le détail d'une relance qui fusionne loyer et charges du
            // même jour (TCK-2679), et `charges_url` le lien des charges ({@see variant()}).
            self::LeasePaymentDueSoon, self::LeasePaymentOverdue => [
                'payment_url' => self::PARAM_URL,
                'rent' => self::PARAM_MONEY,
                'charges' => self::PARAM_MONEY,
                'charges_url' => self::PARAM_URL,
            ],
            self::LeasePaymentOverdueLandlord => ['rent' => self::PARAM_MONEY, 'charges' => self::PARAM_MONEY],
            // Le lien `/pay/{jeton}` sert la quittance : jamais tronqué.
            self::LeasePaymentSettledOnline => ['receipt_url' => self::PARAM_URL],
            // TCK-1002 — la quittance d'un paiement enregistré par l'agence, même lien.
            self::LeasePaymentRecorded => ['receipt_url' => self::PARAM_URL],
            default => [],
        };
    }

    /**
     * P164.06 (TCK-1472) — les paramètres dont l'absence (nul ou vide) fait choisir la variante
     * `<surface>_unnamed` : la phrase existante privée du nom, au lieu de « — ».
     *
     * @return list<string>
     */
    public function unnamedParams(): array
    {
        return match ($this) {
            self::BankStatementImported => ['bank'],
            self::GovernanceRoleCapabilitiesChanged => ['role'],
            // TCK-2717 — le contact du visiteur, retiré de l'avis au bailleur d'un bien d'agence quand la
            // visite est née avec une fiche (`VisitNotifier::params`) : la phrase sans lui, pas « — ».
            self::VisitRequested, self::VisitRequestedWindow => ['contact'],
            default => [],
        };
    }

    /**
     * TCK-602 (VERIF-602 M2, ADR-0051 §1) — les paramètres qui portent un LIEN PORTEUR (`/pay/{jeton}`) :
     * qui le détient paie l'échéance et lit sa quittance. Il ne part que par un canal sortant vers
     * un contact SANS compte, et n'est jamais persisté : `NotificationService` le retire de tout
     * envoi à un compte (cloche, `app_notifications`), et chiffre la notification mise en file qui le
     * porte.
     *
     * @return list<string>
     */
    public function bearerParams(): array
    {
        return match ($this) {
            // TCK-2706 — le lien des charges d'une relance fusionnée est un lien porteur comme l'autre.
            self::LeasePaymentDueSoon, self::LeasePaymentOverdue => ['payment_url', 'charges_url'],
            self::LeasePaymentSettledOnline, self::LeasePaymentRecorded => ['receipt_url'],
            default => [],
        };
    }

    /**
     * TCK-2706 (voie 2 du porteur, 2026-11-11) — la VARIANTE de texte que les paramètres désignent :
     * `rent_charges` quand une relance porte le loyer ET les charges d'un même jour (`rent`, `charges`),
     * `charges` quand elle ne porte que les charges ; `null` sinon (le texte de loyer d'aujourd'hui,
     * inchangé). Le rendu cherche `<surface>_<variante>[_link]` avant `<surface>[_link]`, et un envoi
     * WhatsApp hors fenêtre cherche le gabarit de `<code>.<variante>`, qui n'existe pas : il retombe
     * sur le SMS plutôt que d'envoyer le gabarit du loyer seul.
     *
     * @param  array<string, mixed>  $params
     */
    public function variant(array $params): ?string
    {
        if (! in_array($this, [self::LeasePaymentDueSoon, self::LeasePaymentOverdue, self::LeasePaymentOverdueLandlord], true)
            || ! is_array($params['charges'] ?? null)) {
            return null;
        }

        return is_array($params['rent'] ?? null) ? 'rent_charges' : 'charges';
    }

    /**
     * TCK-2706 — les paramètres facultatifs qui n'existent que dans une variante ({@see variant()}) :
     * aucun gabarit WhatsApp du code ne les porte, puisque la variante n'a pas de gabarit.
     *
     * @return list<string>
     */
    public function variantParams(): array
    {
        return match ($this) {
            self::LeasePaymentDueSoon, self::LeasePaymentOverdue => ['rent', 'charges', 'charges_url'],
            self::LeasePaymentOverdueLandlord => ['rent', 'charges'],
            default => [],
        };
    }

    /**
     * Le paramètre qui accorde le texte (`trans_choice`), s'il y en a un.
     */
    public function pluralParam(): ?string
    {
        return match ($this) {
            self::LeasePaymentOverdue, self::LeasePaymentOverdueLandlord => 'days',
            self::LeasePaymentOverdueDigest => 'count',
            self::CommissionPaid => 'count',
            self::BankStatementImported => 'lines',
            default => null,
        };
    }

    /** Le code peut partir sur WhatsApp ou SMS. */
    public function mobile(): bool
    {
        return match ($this) {
            self::LeasePaymentDueSoon, self::LeasePaymentOverdue, self::LeasePaymentOverdueLandlord,
            self::LeasePaymentSettledOnline,
            // TCK-1002 — vers un contact sans compte seulement : l'envoi à un compte retient le
            // canal mobile (`LeasePaymentService::markPaid`, `$mobileBorne = false`).
            self::LeasePaymentRecorded,
            // TCK-2320 (P39.07) — le remboursement de ce qu'une quittance couvrait : vers un contact
            // sans compte, ou le numéro de la fiche (TCK-1493). Sans préférence, aucun canal mobile
            // vers un compte.
            self::LeasePaymentRefunded,
            // TCK-2793 — de même pour la pénalité payée seule.
            self::LeasePaymentLateFeeRefunded,
            self::VisitReminder,
            // TCK-590 (contrainte 4) — un SMS ne suit qu'un geste humain de l'agence, jamais le
            // dépôt d'une demande par un tiers ; il est borné au point d'envoi (`VisitNotifier`).
            self::VisitConfirmed, self::VisitRescheduled, self::VisitCancelled, self::VisitCancelledWindow,
            // TCK-589 — le lien d'une invitation adressée à un NUMÉRO (geste humain de l'agence,
            // borné par numéro au point d'envoi) et l'avis à l'ancien numéro remplacé : leur
            // destinataire est un contact sans compte qu'on ne joint que par là. Sans préférence
            // (`preferenceEvent()` null), ils n'ouvrent aucun canal mobile vers un compte.
            self::InvitationReceived, self::InvitationReminder, self::AccountPhoneChanged,
            self::BookingConfirmed, self::BookingRejected, self::BookingCancelled => true,
            // TCK-2734 — comme le refus : la fin de sa demande, conséquence d'un geste de l'agence.
            self::BookingApplicationNotSelected => true,
            // TCK-2579 — un geste humain de l'agence, vers un client qui peut n'avoir que le
            // téléphone de sa fiche ; la limite horaire par numéro du canal le borne.
            self::BookingRecordedOnBehalf => true,
            default => false,
        };
    }

    /**
     * TCK-1350 (P88.04) — les codes qui atteignent encore un compte bloqué ou supprimé : ceux qui
     * lui annoncent l'état du compte lui-même. Tout autre code se tait pour lui (un compte qui ne
     * peut ouvrir aucune session ne peut agir sur rien de ce qu'on lui annonce). La fin d'une
     * consultation de son compte par la plateforme en est : le blocage la clôt, et le titulaire en
     * est prévenu (`ImpersonationLifecycleTest`).
     */
    public function reachesUnreachableAccount(): bool
    {
        return in_array($this, [self::AccountBlocked, self::AccountReactivated, self::ImpersonationEnded], true);
    }

    /**
     * Le code peut viser un contact sans compte : transactionnel seulement (exécution du bail,
     * demande de visite, lien d'une invitation adressée à un numéro — TCK-589). Jamais un
     * message non transactionnel (ADR-0032 §3).
     */
    public function reachesContacts(): bool
    {
        return match ($this) {
            self::LeasePaymentDueSoon, self::LeasePaymentOverdue, self::VisitReminder,
            // TCK-602 — la quittance d'une échéance payée en ligne : transactionnel.
            self::LeasePaymentSettledOnline,
            // TCK-1002 — et celle d'une échéance enregistrée payée par l'agence.
            self::LeasePaymentRecorded,
            // TCK-2320 — et le remboursement de cette échéance par le fournisseur.
            self::LeasePaymentRefunded,
            // TCK-2793 — et celui de sa pénalité payée seule.
            self::LeasePaymentLateFeeRefunded,
            self::InvitationReceived, self::InvitationReminder,
            self::AccountPhoneChanged,
            self::VisitConfirmed, self::VisitRescheduled, self::VisitCancelled, self::VisitCancelledWindow,
            self::LeadAcknowledged => true,
            // TCK-2579 — transactionnel : une demande enregistrée en son nom, qu'il peut annuler.
            self::BookingRecordedOnBehalf => true,
            default => false,
        };
    }

    /** L'événement de {@see EditableNotificationEvents} dont un gabarit actif l'emporte. */
    public function templateEvent(): ?string
    {
        return match ($this) {
            self::BookingConfirmed => 'booking_confirmed',
            // P98.04 (TCK-1168) — « Paiement reçu » couvre la quittance en ligne : mêmes paramètres,
            // même préférence, et son titre est déjà « Paiement reçu ».
            self::LeasePaymentRecorded, self::LeasePaymentSettledOnline => 'payment_received',
            self::MaintenanceCreated => 'maintenance_created',
            default => null,
        };
    }

    /**
     * Les événements de préférence qu'au moins un code mobile commande.
     *
     * @return list<string>
     */
    public static function mobileEvents(): array
    {
        $events = [];
        foreach (self::cases() as $code) {
            if ($code->mobile() && $code->preferenceEvent() !== null) {
                $events[$code->preferenceEvent()] = true;
            }
        }

        return array_keys($events);
    }
}
