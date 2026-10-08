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

    // ─── Invitations par SMS (TCK-589 : le destinataire n'a souvent pas de compte) ───────
    case InvitationReceived = 'invitation.received';
    case InvitationReminder = 'invitation.reminder';

    // ─── Sécurité du compte (TCK-589 p3-1 : avis à l'ANCIEN numéro, qui n'a plus de compte) ─
    case AccountPhoneChanged = 'account.phone_changed';

    // ─── Console plateforme (TCK-600) ───────────────────────────────────────────────────
    /** À la cible, à la fermeture d'une session d'impersonation, quelle qu'en soit la cause (ADR-0055). */
    case ImpersonationEnded = 'impersonation.ended';
    /** Aux admins de l'agence (ADR-0048). */
    case AgencySuspended = 'agency.suspended';
    case AgencyReinstated = 'agency.reinstated';
    /** Au compte bloqué ou réactivé depuis la console. */
    case AccountBlocked = 'account.blocked';
    case AccountReactivated = 'account.reactivated';
    /** Aux admins de l'agence : un bien dépublié parce que son seul contact a été effacé. */
    case PropertyUnpublishedContactErased = 'property.unpublished_contact_erased';
    /** Aux autres `super_admin` : un opérateur a été retiré (ADR-0047). */
    case PlatformOperatorRevoked = 'platform_operator.revoked';

    /** Les natures de paramètre, chacune formatée à sa façon au rendu. */
    public const PARAM_MONEY = 'money';

    public const PARAM_DATE = 'date';

    public const PARAM_DATETIME = 'datetime';

    public const PARAM_COUNT = 'count';

    public const PARAM_TEXT = 'text';

    /** Un lien : jamais tronqué, contrairement à un texte dans un SMS. */
    public const PARAM_URL = 'url';

    public function type(): NotificationType
    {
        return match ($this) {
            self::LeasePaymentDueSoon, self::LeasePaymentOverdue, self::LeasePaymentOverdueLandlord,
            self::LeasePaymentOverdueDigest, self::LeasePaymentRecorded,
            self::LeasePaymentReceivedLandlord, self::PaymentDuplicate,
            self::PaymentDuplicateLateFee => NotificationType::Payment,
            self::BookingCreated, self::BookingConfirmed, self::BookingRejected,
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
            self::KycSubmitted, self::KycVerified, self::KycRejected,
            self::PropertyApproved, self::PropertyRejected,
            self::InvitationReceived, self::InvitationReminder,
            self::AccountPhoneChanged => NotificationType::System,
            self::ImpersonationEnded, self::AgencySuspended, self::AgencyReinstated,
            self::AccountBlocked, self::AccountReactivated, self::PropertyUnpublishedContactErased,
            self::PlatformOperatorRevoked => NotificationType::System,
            self::ProspectMatchDigest => NotificationType::System,
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
            self::BookingCreated => 'booking_request',
            self::BookingConfirmed, self::BookingRejected, self::BookingCancelled => 'booking_status_changed',
            // TCK-590 — tous les événements d'une visite obéissent au même interrupteur (TCK-070).
            self::VisitReminder, self::VisitRequested, self::VisitRescheduledByVisitor,
            self::VisitCancelledByVisitor, self::VisitConfirmed, self::VisitRescheduled,
            self::VisitCancelled => 'visit_reminder',
            self::MessageReceived, self::LeadReceived => 'message_received',
            // Un accusé de réception à un contact sans compte : ni compte, ni préférence.
            self::LeadAcknowledged => null,
            self::KycSubmitted, self::KycVerified, self::KycRejected => 'kyc_status_changed',
            self::MaintenanceCreated, self::MaintenanceQuoteRequested, self::MaintenanceQuoteSubmitted,
            self::MaintenanceQuoteApproved, self::MaintenanceQuoteRejected => 'maintenance_status_changed',
            self::MaintenanceAssigned, self::MaintenanceUnassigned, self::MaintenanceAccepted, self::MaintenanceDeclined, self::MaintenanceCompleted, self::MaintenanceConfirmed, self::MaintenanceContested, self::MaintenanceAutoClosed, self::MaintenanceCancelled, self::MaintenanceStepAcknowledged, self::MaintenanceStepAssigned, self::MaintenanceStepInProgress, self::MaintenanceStepCompleted, self::MaintenanceStepClosed, self::MaintenanceStepCancelled, self::MaintenanceStepAcknowledgedScheduled, self::MaintenanceStepAssignedScheduled, self::MaintenanceStepInProgressScheduled, self::MaintenanceQuoteAwaitingOwner => 'maintenance_status_changed',
            self::RoleDelegationActivated, self::RoleDelegationActivatedDelegator,
            self::RoleDelegationExpired, self::RoleDelegationExpiredDelegator,
            self::RoleDelegationRevoked, self::RoleDelegationRevokedDelegator,
            self::BankStatementImported, self::BankStatementFinalized,
            self::PropertyApproved, self::PropertyRejected, self::ProspectMatchDigest,
            // TCK-593 — une somme à rembourser : l'admin ne peut pas s'en désabonner.
            self::PaymentDuplicate, self::PaymentDuplicateLateFee => null,
            self::InvitationReceived, self::InvitationReminder => null,
            // Un avis de sécurité : on ne s'en désabonne pas.
            self::AccountPhoneChanged => null,
            // TCK-600 — avis de la plateforme sur le compte ou l'agence : non désactivables.
            self::ImpersonationEnded, self::AgencySuspended, self::AgencyReinstated,
            self::AccountBlocked, self::AccountReactivated, self::PropertyUnpublishedContactErased,
            self::PlatformOperatorRevoked => null,
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
            // Le nom de l'agence seul, jamais un texte de l'invitant (vérification adverse m1).
            self::InvitationReceived, self::InvitationReminder => ['agency' => self::PARAM_TEXT, 'url' => self::PARAM_URL],
            // Aucun paramètre : ni l'ancien ni le nouveau numéro dans un SMS adressé à l'ancien.
            self::AccountPhoneChanged => [],
            self::ProspectMatchDigest => ['properties' => self::PARAM_COUNT, 'prospects' => self::PARAM_COUNT],
            // TCK-600 — le motif est la saisie d'un opérateur, jamais une phrase de l'API.
            self::ImpersonationEnded => ['operator' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT, 'started_at' => self::PARAM_DATETIME, 'ended_at' => self::PARAM_DATETIME],
            self::AgencySuspended, self::AgencyReinstated => ['agency' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT],
            self::AccountBlocked, self::AccountReactivated => ['reason' => self::PARAM_TEXT],
            self::PropertyUnpublishedContactErased => ['property' => self::PARAM_TEXT, 'reference' => self::PARAM_TEXT, 'url' => self::PARAM_URL],
            self::PlatformOperatorRevoked => ['operator' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT],
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
