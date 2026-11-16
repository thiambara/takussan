<?php

namespace App\Domain\Notifications;

use App\Services\Notifications\PreferenceResolver;

/**
 * TCK-2863 — le catalogue de l'écran des préférences de notification : pour chaque événement
 * réglable ({@see PreferenceResolver::EVENTS}), les personas de `/app` qui le reçoivent, pour que
 * l'écran masque ceux que la persona active ne reçoit jamais ; et les événements IMPOSÉS, rendus
 * sans interrupteur parce qu'ils partent toujours.
 *
 * Les noms de persona sont ceux du menu de `/app` (`takussan-web/src/lib/navigation/personas.ts`,
 * `PERSONAS`). La table est DÉCLARÉE, relevée sur les émetteurs de chaque événement (le
 * destinataire de chaque `NotificationCode` dont {@see NotificationCode::preferenceEvent()} le
 * rend, et des classes `Notification` qui le portent) : `NotificationPreferencesCatalogTest`
 * casse sur un événement réglable qui n'y a pas sa ligne.
 *
 * `identity_verification` est le verdict KYC (`kyc_status_changed`), événement CRITIQUE de
 * {@see PreferenceResolver::CRITICAL_EVENTS} : application et e-mail toujours, quelles que soient
 * les préférences. Il n'est pas dans `EVENTS` — `updateMany()` n'a donc rien à écrire pour lui.
 */
final class PreferenceCatalog
{
    /** @var list<string> */
    public const PERSONAS = ['client', 'locataire', 'bailleur', 'agent', 'admin-agence', 'hote', 'prestataire', 'plateforme'];

    private const GESTION = ['bailleur', 'agent', 'admin-agence', 'hote'];

    private const PERSONNEL = ['agent', 'admin-agence', 'hote'];

    /** @var array<string, list<string>> */
    public const EVENT_PERSONAS = [
        'message_received' => ['client', 'locataire', 'bailleur', 'agent', 'admin-agence', 'hote', 'prestataire'],
        'booking_request' => self::GESTION,
        'booking_status_changed' => ['client', 'locataire', ...self::GESTION],
        'lease_payment_due' => ['locataire'],
        'lease_payment_overdue' => ['locataire', ...self::GESTION],
        'lease_payment_received' => ['locataire', ...self::GESTION],
        'lease_renewed' => ['locataire', ...self::GESTION],
        'lease_early_termination' => ['locataire', ...self::GESTION],
        'lease_rent_reviewed' => ['locataire', ...self::GESTION],
        'invoice_reminder_sent' => ['locataire'],
        'maintenance_status_changed' => ['locataire', ...self::GESTION, 'prestataire'],
        'review_received' => [...self::GESTION, 'prestataire'],
        'saved_search_match' => ['client', 'locataire'],
        'visit_reminder' => ['client', 'locataire', ...self::PERSONNEL],
        'threshold_alert' => self::PERSONNEL,
        'task_due_reminder' => self::PERSONNEL,
        'tenant_inventory_reminder' => ['locataire', ...self::PERSONNEL],
        'favorite_price_drop' => ['client', 'locataire'],
        'favorite_unavailable' => ['client', 'locataire'],
        'property_availability_check' => self::GESTION,
        'document_expiring' => ['client', 'locataire', 'bailleur', 'agent', 'admin-agence', 'hote', 'prestataire'],
    ];

    /**
     * Les événements imposés : l'événement qui les porte, leurs canaux fixes, et qui les reçoit.
     *
     * @var array<string, array{event_type: string, channels: list<string>, personas: list<string>}>
     */
    public const IMPOSED = [
        'identity_verification' => [
            'event_type' => 'kyc_status_changed',
            'channels' => [PreferenceResolver::CHANNEL_INAPP, PreferenceResolver::CHANNEL_EMAIL],
            'personas' => [...self::GESTION, 'prestataire'],
        ],
    ];

    /**
     * Le catalogue rendu par `GET /api/me/notification-preferences` (`catalog`), filtré par
     * persona quand elle est donnée.
     *
     * @return list<array{event_type: string, locked: bool, channels: list<string>|null, personas: list<string>, reason?: string}>
     */
    public static function for(?string $persona = null): array
    {
        $rows = [];
        foreach (PreferenceResolver::EVENTS as $event) {
            $rows[] = ['event_type' => $event, 'locked' => false, 'channels' => null, 'personas' => self::EVENT_PERSONAS[$event] ?? self::PERSONAS];
        }
        foreach (self::IMPOSED as $key => $imposed) {
            $rows[] = ['event_type' => $key, 'locked' => true, 'channels' => $imposed['channels'], 'personas' => $imposed['personas'], 'reason' => 'always_sent'];
        }

        return $persona === null
            ? $rows
            : array_values(array_filter($rows, fn (array $row) => in_array($persona, $row['personas'], true)));
    }
}
