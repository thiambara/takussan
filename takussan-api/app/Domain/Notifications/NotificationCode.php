<?php

namespace App\Domain\Notifications;

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

    // ─── Encaissements en ligne (TCK-593) ───────────────────────────────────────────────
    case PaymentDuplicate = 'payment.duplicate';
    case PaymentDuplicateLateFee = 'payment.duplicate_late_fee';

    // ─── Réservations ───────────────────────────────────────────────────────────────────
    case BookingCreated = 'booking.created';

    /** TCK-596 — une demande sans dates (offre d'achat, demande privée non datée) : « du … au … » vide sinon. */
    case BookingRequestedUndated = 'booking.requested_undated';
    case BookingConfirmed = 'booking.confirmed';
    case BookingRejected = 'booking.rejected';
    case BookingCancelled = 'booking.cancelled';

    // ─── Visites, messages, leads ───────────────────────────────────────────────────────
    case VisitReminder = 'visit.reminder';
    case MessageReceived = 'message.received';
    case LeadReceived = 'lead.received';

    // ─── Visites et demandes de contact (TCK-590) ───────────────────────────────────────
    // Vers l'agence : une demande, un créneau proposé ou une annulation par le visiteur.
    case VisitRequested = 'visit.requested';
    case VisitRescheduledByVisitor = 'visit.rescheduled_by_visitor';
    case VisitCancelledByVisitor = 'visit.cancelled_by_visitor';
    // Vers le visiteur, compte ou contact sans compte : un geste HUMAIN de l'agence.
    case VisitConfirmed = 'visit.confirmed';
    case VisitRescheduled = 'visit.rescheduled';
    case VisitCancelled = 'visit.cancelled';
    // Vers le visiteur qui a laissé un e-mail : l'accusé de réception de sa demande.
    case LeadAcknowledged = 'lead.acknowledged';

    // ─── KYC d'agence ───────────────────────────────────────────────────────────────────
    case KycSubmitted = 'kyc.submitted';
    case KycVerified = 'kyc.verified';
    case KycRejected = 'kyc.rejected';
    // TCK-601 — la pièce du dirigeant arrive à échéance (J-30, J-7).
    case KycExpiringSoon = 'kyc.expiring_soon';

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

    // ─── CRM ───────────────────────────────────────────────────────────────────────────
    /** TCK-591 — le récapitulatif quotidien des biens qui correspondent aux prospects d'un référent. */
    case ProspectMatchDigest = 'prospect_match.digest';

    // ─── Modération des biens (envoyés par leurs classes Notification) ──────────────────
    case PropertyApproved = 'property.approved';
    case PropertyRejected = 'property.rejected';

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

    // ─── Sorties d'argent (TCK-594, ADR-0039) ───────────────────────────────────────────
    case PayoutAwaitingApproval = 'payout.awaiting_approval';
    case PayoutDue = 'payout.due';
    case PayoutProcessed = 'payout.processed';
    case PayoutFailed = 'payout.failed';
    case PayoutMethodAdded = 'payout_method.added';
    case PayoutMethodUpdated = 'payout_method.updated';
    case PayoutMethodRemoved = 'payout_method.removed';
    case PayoutThresholdRelaxRequested = 'payout_threshold.relax_requested';
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

    // ─── Sécurité du compte (TCK-589 p3-1 : avis à l'ANCIEN numéro, qui n'a plus de compte) ─
    case AccountPhoneChanged = 'account.phone_changed';

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

    public function type(): NotificationType
    {
        return match ($this) {
            self::LeasePaymentDueSoon, self::LeasePaymentOverdue, self::LeasePaymentOverdueLandlord,
            self::LeasePaymentOverdueDigest, self::LeasePaymentRecorded,
            self::LeasePaymentReceivedLandlord, self::PaymentDuplicate,
            self::PaymentDuplicateLateFee => NotificationType::Payment,
            self::BookingCreated, self::BookingRequestedUndated, self::BookingConfirmed, self::BookingRejected,
            self::BookingCancelled => NotificationType::Booking,
            self::VisitReminder, self::VisitRequested, self::VisitRescheduledByVisitor,
            self::VisitCancelledByVisitor, self::VisitConfirmed, self::VisitRescheduled,
            self::VisitCancelled => NotificationType::Visit,
            self::MessageReceived, self::LeadReceived, self::LeadAcknowledged => NotificationType::Message,
            self::RoleDelegationActivated, self::RoleDelegationActivatedDelegator => NotificationType::RoleDelegated,
            self::RoleDelegationExpired, self::RoleDelegationExpiredDelegator => NotificationType::RoleDelegationExpired,
            self::RoleDelegationRevoked, self::RoleDelegationRevokedDelegator => NotificationType::RoleDelegationRevoked,
            self::BankStatementImported => NotificationType::BankStatementImported,
            self::BankStatementFinalized => NotificationType::BankStatementFinalized,
            self::MaintenanceCreated, self::MaintenanceQuoteRequested, self::MaintenanceQuoteSubmitted,
            self::MaintenanceQuoteApproved, self::MaintenanceQuoteRejected => NotificationType::Maintenance,
            self::MaintenanceAssigned, self::MaintenanceUnassigned, self::MaintenanceAccepted, self::MaintenanceDeclined, self::MaintenanceCompleted, self::MaintenanceConfirmed, self::MaintenanceContested, self::MaintenanceAutoClosed, self::MaintenanceCancelled, self::MaintenanceStepAcknowledged, self::MaintenanceStepAssigned, self::MaintenanceStepInProgress, self::MaintenanceStepCompleted, self::MaintenanceStepClosed, self::MaintenanceStepCancelled, self::MaintenanceStepAcknowledgedScheduled, self::MaintenanceStepAssignedScheduled, self::MaintenanceStepInProgressScheduled, self::MaintenanceQuoteAwaitingOwner => NotificationType::Maintenance,
            self::KycSubmitted, self::KycVerified, self::KycRejected, self::KycExpiringSoon,
            self::GovernanceRoleCapabilitiesChanged, self::GovernanceAdminAdded, self::GovernanceDataExported,
            self::GovernanceIntegrationChanged, self::GovernanceApprovalThresholdChanged,
            self::PropertyApproved, self::PropertyRejected,
            self::ReviewToModerate, self::ReviewReceived,
            self::ModerationPropertyHidden, self::ModerationPropertyRemoved,
            self::ModerationReportUpheld, self::ModerationReportDismissed,
            self::InvitationReceived, self::InvitationReminder,
            self::AccountPhoneChanged => NotificationType::System,
            self::ProspectMatchDigest => NotificationType::System,
            self::PropertyCalendarConflict, self::PropertyCalendarFeedFailing => NotificationType::System,
            self::LeaseSignatureRequested, self::LeaseSignedByParty,
            self::LeaseSignatureCompleted => NotificationType::Lease,
            self::PayoutAwaitingApproval, self::PayoutDue, self::PayoutProcessed, self::PayoutFailed,
            self::PayoutMethodAdded, self::PayoutMethodUpdated, self::PayoutMethodRemoved,
            self::PayoutThresholdRelaxRequested, self::OwnerStatementAvailable => NotificationType::Payment,
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
            self::LeasePaymentRecorded, self::LeasePaymentReceivedLandlord => 'lease_payment_received',
            self::BookingCreated, self::BookingRequestedUndated => 'booking_request',
            self::BookingConfirmed, self::BookingRejected, self::BookingCancelled => 'booking_status_changed',
            // TCK-590 — tous les événements d'une visite obéissent au même interrupteur (TCK-070).
            self::VisitReminder, self::VisitRequested, self::VisitRescheduledByVisitor,
            self::VisitCancelledByVisitor, self::VisitConfirmed, self::VisitRescheduled,
            self::VisitCancelled => 'visit_reminder',
            self::ReviewToModerate, self::ReviewReceived => 'review_received',
            self::MessageReceived, self::LeadReceived => 'message_received',
            // Un accusé de réception à un contact sans compte : ni compte, ni préférence.
            self::LeadAcknowledged => null,
            self::KycSubmitted, self::KycVerified, self::KycRejected, self::KycExpiringSoon => 'kyc_status_changed',
            // Une alerte de sécurité ne se désactive pas : c'est sa raison d'être.
            self::GovernanceRoleCapabilitiesChanged, self::GovernanceAdminAdded, self::GovernanceDataExported,
            self::GovernanceIntegrationChanged, self::GovernanceApprovalThresholdChanged => null,
            self::MaintenanceCreated, self::MaintenanceQuoteRequested, self::MaintenanceQuoteSubmitted,
            self::MaintenanceQuoteApproved, self::MaintenanceQuoteRejected => 'maintenance_status_changed',
            self::MaintenanceAssigned, self::MaintenanceUnassigned, self::MaintenanceAccepted, self::MaintenanceDeclined, self::MaintenanceCompleted, self::MaintenanceConfirmed, self::MaintenanceContested, self::MaintenanceAutoClosed, self::MaintenanceCancelled, self::MaintenanceStepAcknowledged, self::MaintenanceStepAssigned, self::MaintenanceStepInProgress, self::MaintenanceStepCompleted, self::MaintenanceStepClosed, self::MaintenanceStepCancelled, self::MaintenanceStepAcknowledgedScheduled, self::MaintenanceStepAssignedScheduled, self::MaintenanceStepInProgressScheduled, self::MaintenanceQuoteAwaitingOwner => 'maintenance_status_changed',
            self::RoleDelegationActivated, self::RoleDelegationActivatedDelegator,
            self::RoleDelegationExpired, self::RoleDelegationExpiredDelegator,
            self::RoleDelegationRevoked, self::RoleDelegationRevokedDelegator,
            self::BankStatementImported, self::BankStatementFinalized,
            self::PropertyApproved, self::PropertyRejected, self::ProspectMatchDigest,
            self::PropertyCalendarConflict, self::PropertyCalendarFeedFailing,
            self::LeaseSignatureRequested, self::LeaseSignedByParty, self::LeaseSignatureCompleted,
            // TCK-597 — le retrait d'une annonce et l'issue d'un signalement : non désactivables.
            self::ModerationPropertyHidden, self::ModerationPropertyRemoved,
            self::ModerationReportUpheld, self::ModerationReportDismissed,
            // TCK-593 — une somme à rembourser : l'admin ne peut pas s'en désabonner.
            self::PaymentDuplicate, self::PaymentDuplicateLateFee => null,
            // TCK-594 — une sortie d'argent n'a pas d'interrupteur : l'approbateur, le payeur et le
            // bénéficiaire en sont toujours avisés, et un changement de destination est le signal
            // d'un détournement (ADR-0039 §6).
            self::PayoutAwaitingApproval, self::PayoutDue, self::PayoutProcessed, self::PayoutFailed,
            self::PayoutMethodAdded, self::PayoutMethodUpdated, self::PayoutMethodRemoved,
            self::PayoutThresholdRelaxRequested, self::OwnerStatementAvailable => null,
            self::InvitationReceived, self::InvitationReminder => null,
            // Un avis de sécurité : on ne s'en désabonne pas.
            self::AccountPhoneChanged => null,
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
            self::LeasePaymentOverdueLandlord => ['amount' => self::PARAM_MONEY, 'days' => self::PARAM_COUNT, 'property' => self::PARAM_TEXT, 'tenant' => self::PARAM_TEXT],
            self::LeasePaymentOverdueDigest => ['count' => self::PARAM_COUNT, 'total' => self::PARAM_MONEY],
            self::LeasePaymentRecorded => ['amount' => self::PARAM_MONEY, 'property' => self::PARAM_TEXT],
            self::LeasePaymentReceivedLandlord => ['amount' => self::PARAM_MONEY, 'property' => self::PARAM_TEXT, 'tenant' => self::PARAM_TEXT],
            self::PaymentDuplicate, self::PaymentDuplicateLateFee => ['amount' => self::PARAM_MONEY, 'reference' => self::PARAM_TEXT],
            self::BookingCreated, self::BookingConfirmed, self::BookingRejected,
            self::BookingCancelled => ['reference' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT, 'start_date' => self::PARAM_DATE, 'end_date' => self::PARAM_DATE],
            self::BookingRequestedUndated => ['reference' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT],
            self::VisitReminder => ['property' => self::PARAM_TEXT, 'scheduled_at' => self::PARAM_DATETIME, 'window' => self::PARAM_TEXT],
            self::MessageReceived => ['sender' => self::PARAM_TEXT, 'excerpt' => self::PARAM_TEXT],
            // TCK-590 — de quoi RÉPONDRE : le message entier et le moyen de joindre (téléphone ·
            // e-mail). L'extrait de 80 caractères sans téléphone disait qu'on avait été contacté.
            self::LeadReceived => ['name' => self::PARAM_TEXT, 'contact' => self::PARAM_TEXT, 'message' => self::PARAM_TEXT],
            // L'accusé ne recopie rien de ce que le visiteur a saisi : le bien, ou le nom de l'agent.
            self::LeadAcknowledged => ['about' => self::PARAM_TEXT],
            // `timezone` : le fuseau du destinataire, dans lequel `scheduled_at` est rendu — l'heure
            // d'une visite est toujours suivie de son fuseau (TCK-590, §6). Aucun texte libre du
            // visiteur, ni son message ni le nom qu'il a saisi (contrainte 4).
            self::VisitRequested => ['property' => self::PARAM_TEXT, 'scheduled_at' => self::PARAM_DATETIME, 'timezone' => self::PARAM_TEXT, 'contact' => self::PARAM_TEXT],
            self::VisitRescheduledByVisitor, self::VisitCancelledByVisitor,
            self::VisitConfirmed, self::VisitRescheduled, self::VisitCancelled => ['property' => self::PARAM_TEXT, 'scheduled_at' => self::PARAM_DATETIME, 'timezone' => self::PARAM_TEXT],
            self::KycSubmitted => ['agency' => self::PARAM_TEXT],
            self::KycVerified => [],
            self::KycRejected => ['reason' => self::PARAM_TEXT],
            self::KycExpiringSoon => ['expires_at' => self::PARAM_DATE],
            self::GovernanceRoleCapabilitiesChanged => ['role' => self::PARAM_TEXT, 'actor' => self::PARAM_TEXT],
            self::GovernanceAdminAdded => ['member' => self::PARAM_TEXT, 'actor' => self::PARAM_TEXT],
            self::GovernanceDataExported, self::GovernanceApprovalThresholdChanged => ['actor' => self::PARAM_TEXT],
            self::GovernanceIntegrationChanged => ['provider' => self::PARAM_TEXT, 'actor' => self::PARAM_TEXT],
            self::RoleDelegationActivated => ['role' => self::PARAM_TEXT, 'ends_at' => self::PARAM_DATE],
            self::RoleDelegationExpired, self::RoleDelegationRevoked => ['role' => self::PARAM_TEXT],
            self::RoleDelegationActivatedDelegator, self::RoleDelegationExpiredDelegator,
            self::RoleDelegationRevokedDelegator => ['role' => self::PARAM_TEXT, 'beneficiary' => self::PARAM_TEXT],
            self::BankStatementImported => ['bank' => self::PARAM_TEXT, 'lines' => self::PARAM_COUNT],
            self::BankStatementFinalized => ['period_start' => self::PARAM_DATE, 'period_end' => self::PARAM_DATE, 'confirmed' => self::PARAM_COUNT, 'total' => self::PARAM_COUNT],
            self::MaintenanceCreated => ['property' => self::PARAM_TEXT, 'reference' => self::PARAM_TEXT],
            self::MaintenanceQuoteRequested, self::MaintenanceQuoteApproved,
            self::MaintenanceUnassigned, self::MaintenanceCompleted, self::MaintenanceConfirmed,
            self::MaintenanceCancelled, self::MaintenanceStepAcknowledged, self::MaintenanceStepAssigned,
            self::MaintenanceStepInProgress, self::MaintenanceStepCompleted, self::MaintenanceStepClosed,
            self::MaintenanceStepCancelled => ['request' => self::PARAM_TEXT],
            self::MaintenanceQuoteRejected => ['request' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT],
            self::MaintenanceQuoteSubmitted, self::MaintenanceQuoteAwaitingOwner => ['request' => self::PARAM_TEXT, 'amount' => self::PARAM_MONEY],
            self::MaintenanceAssigned => ['request' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT],
            self::MaintenanceAccepted => ['request' => self::PARAM_TEXT, 'provider' => self::PARAM_TEXT],
            self::MaintenanceDeclined => ['request' => self::PARAM_TEXT, 'provider' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT],
            self::MaintenanceContested => ['request' => self::PARAM_TEXT, 'comment' => self::PARAM_TEXT],
            self::MaintenanceAutoClosed => ['request' => self::PARAM_TEXT, 'days' => self::PARAM_COUNT],
            self::MaintenanceStepAcknowledgedScheduled, self::MaintenanceStepAssignedScheduled,
            self::MaintenanceStepInProgressScheduled => ['request' => self::PARAM_TEXT, 'scheduled_at' => self::PARAM_DATETIME],
            self::PropertyApproved => ['property' => self::PARAM_TEXT],
            self::PropertyRejected => ['property' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT],
            self::PropertyCalendarConflict => ['property' => self::PARAM_TEXT, 'feed' => self::PARAM_TEXT, 'start_date' => self::PARAM_DATE, 'end_date' => self::PARAM_DATE],
            self::PropertyCalendarFeedFailing => ['property' => self::PARAM_TEXT, 'feed' => self::PARAM_TEXT],
            self::LeaseSignatureRequested, self::LeaseSignatureCompleted => ['reference' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT],
            self::LeaseSignedByParty => ['reference' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT, 'signer' => self::PARAM_TEXT],
            self::PayoutAwaitingApproval, self::PayoutDue => ['reference' => self::PARAM_TEXT, 'amount' => self::PARAM_MONEY],
            // `transaction` et `destination` (forme masquée) valent « — » pour un paiement en espèces.
            self::PayoutProcessed => ['reference' => self::PARAM_TEXT, 'amount' => self::PARAM_MONEY, 'transaction' => self::PARAM_TEXT, 'destination' => self::PARAM_TEXT],
            self::PayoutFailed => ['reference' => self::PARAM_TEXT, 'amount' => self::PARAM_MONEY, 'reason' => self::PARAM_TEXT],
            self::PayoutMethodAdded, self::PayoutMethodUpdated, self::PayoutMethodRemoved => ['destination' => self::PARAM_TEXT],
            self::PayoutThresholdRelaxRequested => ['agency' => self::PARAM_TEXT],
            self::OwnerStatementAvailable => ['period' => self::PARAM_TEXT],
            self::ReviewToModerate, self::ReviewReceived => ['subject' => self::PARAM_TEXT, 'rating' => self::PARAM_COUNT],
            self::ModerationPropertyHidden, self::ModerationPropertyRemoved => ['property' => self::PARAM_TEXT, 'reason_code' => self::PARAM_REASON_CODE, 'reason' => self::PARAM_TEXT],
            self::ModerationReportUpheld, self::ModerationReportDismissed => ['property' => self::PARAM_TEXT],
            // Le nom de l'agence seul, jamais un texte de l'invitant (vérification adverse m1).
            self::InvitationReceived, self::InvitationReminder => ['agency' => self::PARAM_TEXT, 'url' => self::PARAM_URL],
            // Aucun paramètre : ni l'ancien ni le nouveau numéro dans un SMS adressé à l'ancien.
            self::AccountPhoneChanged => [],
            self::ProspectMatchDigest => ['properties' => self::PARAM_COUNT, 'prospects' => self::PARAM_COUNT],
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
            self::LeasePaymentDueSoon, self::LeasePaymentOverdue => ['payment_url' => self::PARAM_URL],
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
            self::BankStatementImported => 'lines',
            default => null,
        };
    }

    /** Le code peut partir sur WhatsApp ou SMS. */
    public function mobile(): bool
    {
        return match ($this) {
            self::LeasePaymentDueSoon, self::LeasePaymentOverdue, self::LeasePaymentOverdueLandlord,
            self::VisitReminder,
            // TCK-590 (contrainte 4) — un SMS ne suit qu'un geste humain de l'agence, jamais le
            // dépôt d'une demande par un tiers ; il est borné au point d'envoi (`VisitNotifier`).
            self::VisitConfirmed, self::VisitRescheduled, self::VisitCancelled,
            // TCK-589 — le lien d'une invitation adressée à un NUMÉRO (geste humain de l'agence,
            // borné par numéro au point d'envoi) et l'avis à l'ancien numéro remplacé : leur
            // destinataire est un contact sans compte qu'on ne joint que par là. Sans préférence
            // (`preferenceEvent()` null), ils n'ouvrent aucun canal mobile vers un compte.
            self::InvitationReceived, self::InvitationReminder, self::AccountPhoneChanged,
            self::BookingConfirmed, self::BookingRejected, self::BookingCancelled => true,
            default => false,
        };
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
            self::InvitationReceived, self::InvitationReminder,
            self::AccountPhoneChanged,
            self::VisitConfirmed, self::VisitRescheduled, self::VisitCancelled,
            self::LeadAcknowledged => true,
            default => false,
        };
    }

    /** L'événement de {@see EditableNotificationEvents} dont un gabarit actif l'emporte. */
    public function templateEvent(): ?string
    {
        return match ($this) {
            self::BookingConfirmed => 'booking_confirmed',
            self::LeasePaymentRecorded => 'payment_received',
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
