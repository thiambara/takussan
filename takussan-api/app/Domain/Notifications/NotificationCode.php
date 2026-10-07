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

    // ─── Réservations ───────────────────────────────────────────────────────────────────
    case BookingCreated = 'booking.created';
    case BookingConfirmed = 'booking.confirmed';
    case BookingRejected = 'booking.rejected';
    case BookingCancelled = 'booking.cancelled';

    // ─── Visites, messages, leads ───────────────────────────────────────────────────────
    case VisitReminder = 'visit.reminder';
    case MessageReceived = 'message.received';
    case LeadReceived = 'lead.received';

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

    // ─── Modération des biens (envoyés par leurs classes Notification) ──────────────────
    case PropertyApproved = 'property.approved';
    case PropertyRejected = 'property.rejected';

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
            self::LeasePaymentReceivedLandlord => NotificationType::Payment,
            self::BookingCreated, self::BookingConfirmed, self::BookingRejected,
            self::BookingCancelled => NotificationType::Booking,
            self::VisitReminder => NotificationType::Visit,
            self::MessageReceived, self::LeadReceived => NotificationType::Message,
            self::RoleDelegationActivated, self::RoleDelegationActivatedDelegator => NotificationType::RoleDelegated,
            self::RoleDelegationExpired, self::RoleDelegationExpiredDelegator => NotificationType::RoleDelegationExpired,
            self::RoleDelegationRevoked, self::RoleDelegationRevokedDelegator => NotificationType::RoleDelegationRevoked,
            self::BankStatementImported => NotificationType::BankStatementImported,
            self::BankStatementFinalized => NotificationType::BankStatementFinalized,
            self::MaintenanceCreated, self::MaintenanceQuoteRequested, self::MaintenanceQuoteSubmitted,
            self::MaintenanceQuoteApproved, self::MaintenanceQuoteRejected => NotificationType::Maintenance,
            self::KycSubmitted, self::KycVerified, self::KycRejected,
            self::PropertyApproved, self::PropertyRejected => NotificationType::System,
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
            self::VisitReminder => 'visit_reminder',
            self::MessageReceived, self::LeadReceived => 'message_received',
            self::KycSubmitted, self::KycVerified, self::KycRejected => 'kyc_status_changed',
            self::MaintenanceCreated, self::MaintenanceQuoteRequested, self::MaintenanceQuoteSubmitted,
            self::MaintenanceQuoteApproved, self::MaintenanceQuoteRejected => 'maintenance_status_changed',
            self::RoleDelegationActivated, self::RoleDelegationActivatedDelegator,
            self::RoleDelegationExpired, self::RoleDelegationExpiredDelegator,
            self::RoleDelegationRevoked, self::RoleDelegationRevokedDelegator,
            self::BankStatementImported, self::BankStatementFinalized,
            self::PropertyApproved, self::PropertyRejected => null,
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
            self::BookingCreated, self::BookingConfirmed, self::BookingRejected,
            self::BookingCancelled => ['reference' => self::PARAM_TEXT, 'property' => self::PARAM_TEXT, 'start_date' => self::PARAM_DATE, 'end_date' => self::PARAM_DATE],
            self::VisitReminder => ['property' => self::PARAM_TEXT, 'scheduled_at' => self::PARAM_DATETIME, 'window' => self::PARAM_TEXT],
            self::MessageReceived => ['sender' => self::PARAM_TEXT, 'excerpt' => self::PARAM_TEXT],
            self::LeadReceived => ['name' => self::PARAM_TEXT, 'email' => self::PARAM_TEXT, 'excerpt' => self::PARAM_TEXT],
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
            self::MaintenanceQuoteRejected => ['request' => self::PARAM_TEXT],
            self::MaintenanceQuoteSubmitted => ['request' => self::PARAM_TEXT, 'amount' => self::PARAM_MONEY],
            self::PropertyApproved => ['property' => self::PARAM_TEXT],
            self::PropertyRejected => ['property' => self::PARAM_TEXT, 'reason' => self::PARAM_TEXT],
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
            self::BookingConfirmed, self::BookingRejected, self::BookingCancelled => true,
            default => false,
        };
    }

    /**
     * Le code peut viser un contact sans compte : transactionnel seulement (exécution du bail,
     * demande de visite). Jamais un message non transactionnel (ADR-0032 §3).
     */
    public function reachesContacts(): bool
    {
        return match ($this) {
            self::LeasePaymentDueSoon, self::LeasePaymentOverdue, self::VisitReminder => true,
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
