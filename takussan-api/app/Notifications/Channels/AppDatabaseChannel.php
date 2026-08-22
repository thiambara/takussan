<?php

namespace App\Notifications\Channels;

use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use App\Notifications\AgencyUpgradeApprovedNotification;
use App\Notifications\AgencyUpgradeRejectedNotification;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use App\Notifications\AgentTenantInventoryReminderNotification;
use App\Notifications\BookingExpiredNotification;
use App\Notifications\ConversationInviteNotification;
use App\Notifications\InvoiceOverdueReminderNotification;
use App\Notifications\LeaseDepositRefundNotification;
use App\Notifications\LeaseEarlyTerminationNotification;
use App\Notifications\LeasePaymentLateFeeNotification;
use App\Notifications\LeaseRenewedNotification;
use App\Notifications\LeaseRentReviewedNotification;
use App\Notifications\MaintenanceQuoteRequestedNotification;
use App\Notifications\NewBookingNotification;
use App\Notifications\PropertyApprovedNotification;
use App\Notifications\PropertyRejectedNotification;
use App\Notifications\QuoteApprovedNotification;
use App\Notifications\QuoteRejectedNotification;
use App\Notifications\QuoteSubmittedNotification;
use App\Notifications\SuperAdminAcceptedBroadcast;
use App\Notifications\SuperAdminInvitedBroadcast;
use App\Notifications\TaskDueReminderNotification;
use App\Notifications\TenantInventoryReminderNotification;
use App\Notifications\TenantWelcomeNotification;
use App\Notifications\ThresholdAlertTriggered;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use App\Notifications\VisitConfirmedNotification;
use App\Notifications\VisitReminderNotification;
use App\Notifications\VisitRequestedNotification;
use Illuminate\Notifications\Notification;
use LogicException;

/**
 * Le canal qui manquait — celui que `docs/models-spec.md` §12 décrit depuis le
 * 2026-04-13 et que personne n'avait écrit.
 *
 * ─── La décision, et le trou ───────────────────────────────────────────────────────
 *
 * `models-spec.md:719` tranche l'architecture des notifications : « approche hybride :
 * table applicative propre, **distincte de la table `notifications` de Laravel** ».
 * `app_notifications` porte le feed in-app, avec son type métier, ses préférences et
 * ses digests ; c'est la seule table que `GET /api/notifications` lit.
 *
 * La même section décrit le pont : « le canal `app_database` est enregistré dans
 * `AppServiceProvider` via `ChannelManager::extend()` ». **Ce canal n'a jamais existé** —
 * `grep -rn app_database app/ config/ tests/` ne rendait rien. Les 29 classes de
 * `app/Notifications/` déclarent donc `'database'`, le canal NATIF de Laravel, qui vise
 * la table `notifications` que la décision avait justement écartée et qu'aucune
 * migration ne créait. Vingt-quatre d'entre elles sont réellement envoyées : elles
 * écrivaient dans le vide, en production comme en test.
 *
 * *Une décision qui n'est écrite que dans une spec n'est pas appliquée ; elle est
 * seulement espérée.* Le trou a survécu quatre mois parce que rien ne pouvait le voir :
 * l'échec d'insertion était avalé, la requête HTTP rendait 201, le test passait. C'est
 * la bascule vers PostgreSQL (ADR-0020) qui l'a rendu bruyant — un moteur qui abandonne
 * la transaction au premier échec ne laisse pas une écriture perdue passer inaperçue.
 *
 * ─── Pourquoi ce canal REMPLACE `database` au lieu de s'ajouter à côté ─────────────
 *
 * La spec le nommait `app_database`, ce qui aurait exigé de réécrire le `via()` des 29
 * classes — et surtout **aurait laissé le trou ouvert** : la trentième classe écrite
 * demain avec `'database'` serait retombée dans le vide, sans un seul rouge pour le
 * dire. En prenant la place du canal natif, aucune classe n'a besoin d'être touchée et
 * la faute redevient impossible.
 *
 * Rien ne dépendait des sémantiques de Laravel : `unreadNotifications`,
 * `DatabaseNotification` et la relation `Notifiable::notifications()` n'ont **aucun**
 * appelant dans ce dépôt, ni côté API ni côté front.
 *
 * ─── Ce que chaque notification doit fournir ───────────────────────────────────────
 *
 * `app_notifications` exige `user_id`, `type` et `title` (le reste est nullable).
 *
 *   · `title` — lu dans `toArray()['title']`, que 23 des 29 classes portent déjà.
 *   · `type`  — lu dans {@see self::TYPES}, **jamais dans `toArray()['type']`** : cette
 *     clé existe dans plusieurs classes et n'y désigne pas le type de notification mais
 *     celui de l'objet métier (`VisitRequestedNotification` y met le type de la visite).
 *     Deviner ici aurait produit des lignes fausses sans jamais lever.
 *   · Une classe qui a besoin d'autre chose — un titre construit, un `referenceable` —
 *     déclare `toAppNotification(object $notifiable): array` et prend la main sur tout.
 *
 * `tests/Feature/Notifications/AppDatabaseChannelTest.php` garde la carte : toute
 * classe qui déclare `'database'` sans être ni cartographiée ni dotée de
 * `toAppNotification()` fait rougir la suite. *Une carte tenue à la main ne reste juste
 * que si quelque chose casse quand elle ne l'est plus.*
 */
class AppDatabaseChannel
{
    /**
     * Type métier de chaque notification qui passe par ce canal.
     *
     * Une seule table plutôt qu'une méthode par classe : on la relit d'un coup d'œil,
     * et la garde de test interdit qu'elle dérive.
     *
     * @var array<class-string, NotificationType>
     */
    public const TYPES = [
        AgencyUpgradeApprovedNotification::class => NotificationType::System,
        AgencyUpgradeRejectedNotification::class => NotificationType::System,
        AgencyUpgradeRequestSubmittedNotification::class => NotificationType::System,
        AgentTenantInventoryReminderNotification::class => NotificationType::Lease,
        BookingExpiredNotification::class => NotificationType::Booking,
        ConversationInviteNotification::class => NotificationType::Message,
        InvoiceOverdueReminderNotification::class => NotificationType::Payment,
        LeaseDepositRefundNotification::class => NotificationType::Lease,
        LeaseEarlyTerminationNotification::class => NotificationType::Lease,
        LeasePaymentLateFeeNotification::class => NotificationType::Payment,
        LeaseRenewedNotification::class => NotificationType::Lease,
        LeaseRentReviewedNotification::class => NotificationType::Lease,
        MaintenanceQuoteRequestedNotification::class => NotificationType::Maintenance,
        NewBookingNotification::class => NotificationType::Booking,
        PropertyApprovedNotification::class => NotificationType::System,
        PropertyRejectedNotification::class => NotificationType::System,
        QuoteApprovedNotification::class => NotificationType::Maintenance,
        QuoteRejectedNotification::class => NotificationType::Maintenance,
        QuoteSubmittedNotification::class => NotificationType::Maintenance,
        SuperAdminAcceptedBroadcast::class => NotificationType::System,
        SuperAdminInvitedBroadcast::class => NotificationType::System,
        TaskDueReminderNotification::class => NotificationType::System,
        TenantInventoryReminderNotification::class => NotificationType::Lease,
        TenantWelcomeNotification::class => NotificationType::Lease,
        ThresholdAlertTriggered::class => NotificationType::System,
        UrgentMaintenanceCreatedNotification::class => NotificationType::Maintenance,
        VisitConfirmedNotification::class => NotificationType::Visit,
        VisitReminderNotification::class => NotificationType::Visit,
        VisitRequestedNotification::class => NotificationType::Visit,
    ];

    public function send(object $notifiable, Notification $notification): ?AppNotification
    {
        // `app_notifications.user_id` porte une clé étrangère vers `users` : un
        // notifiable d'un autre type ne PEUT pas y être rangé. On lève plutôt que de
        // sauter en silence — c'est précisément le silence qui a coûté quatre mois ici,
        // et l'alternative (laisser PostgreSQL rendre une violation de FK) nommerait la
        // colonne, jamais la cause.
        if (! $notifiable instanceof User) {
            throw new LogicException(sprintf(
                '%s a été envoyée à %s : le canal `database` écrit dans `app_notifications`, '
                .'dont `user_id` référence `users`. Router cette notification vers un User, '
                .'ou retirer `database` de son via().',
                $notification::class,
                $notifiable::class,
            ));
        }

        $payload = $this->payload($notifiable, $notification);

        return AppNotification::query()->create([
            'user_id' => $notifiable->getKey(),
            'type' => $payload['type'],
            'delivery_channel' => NotificationChannel::App,
            'title' => $payload['title'],
            'body' => $payload['body'] ?? null,
            'data' => $payload['data'] ?? null,
            'referenceable_type' => $payload['referenceable_type'] ?? null,
            'referenceable_id' => $payload['referenceable_id'] ?? null,
            'sent_at' => now(),
        ]);
    }

    /**
     * @return array{type: NotificationType, title: string, body?: ?string, data?: ?array<string,mixed>, referenceable_type?: ?string, referenceable_id?: ?int}
     */
    private function payload(User $notifiable, Notification $notification): array
    {
        if (method_exists($notification, 'toAppNotification')) {
            /** @var array{type: NotificationType, title: string} $declared */
            $declared = $notification->toAppNotification($notifiable);

            return $declared;
        }

        $data = method_exists($notification, 'toArray') ? $notification->toArray($notifiable) : [];
        $type = self::TYPES[$notification::class] ?? null;
        $title = is_string($data['title'] ?? null) ? $data['title'] : null;

        if ($type === null || $title === null) {
            throw new LogicException(sprintf(
                '%s passe par le canal `database` sans que %s puisse en déduire %s. '
                .'Ajouter la classe à AppDatabaseChannel::TYPES et un `title` dans son toArray(), '
                .'ou lui donner un toAppNotification().',
                $notification::class,
                self::class,
                $type === null ? 'le type' : 'le titre',
            ));
        }

        return ['type' => $type, 'title' => $title, 'data' => $data];
    }
}
