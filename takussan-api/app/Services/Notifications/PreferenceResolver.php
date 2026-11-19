<?php

namespace App\Services\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Models\NotificationPreference;
use App\Models\User;
use App\Notifications\Channels\WhatsappChannel;
use App\Notifications\SavedSearchMatchesNotification;
use App\Notifications\ThresholdAlertTriggered;

/**
 * TCK-070 — Central decision point for "should we send this notification?"
 *
 * Every Notifications\* class should call {@see shouldSend()} from its
 * via() implementation rather than reading flat booleans on User. The
 * resolver also enforces the invariants set in the spec:
 *
 *   - `inapp` is always active (cannot be disabled).
 *   - CRITICAL_EVENTS bypass the user's preferences entirely on
 *     inapp + email (e.g. password_reset, security_alert).
 *   - `sms` requires a verified phone.
 *
 * When no explicit preference row exists for a (user, event, channel)
 * triple, {@see defaultFor()} kicks in.
 *
 * TCK-588 — la matrice ne propose plus que des cases qu'un envoi peut honorer
 * ({@see channelsFor()}) : une case qu'aucun émetteur ne sert est verrouillée
 * `channel_unavailable`, et `updateMany()` l'ignore.
 */
class PreferenceResolver
{
    public const CHANNEL_INAPP = 'inapp';

    public const CHANNEL_EMAIL = 'email';

    public const CHANNEL_SMS = 'sms';

    public const CHANNEL_PUSH = 'push';

    // TCK-282 — WhatsApp outbound channel. Like SMS, gated on a verified
    // phone and opt-out by default.
    public const CHANNEL_WHATSAPP = 'whatsapp';

    /** @var list<string> */
    public const CHANNELS = [self::CHANNEL_INAPP, self::CHANNEL_EMAIL, self::CHANNEL_PUSH, self::CHANNEL_SMS, self::CHANNEL_WHATSAPP];

    /**
     * Canonical list of event types the UI can toggle. Must stay
     * in sync with the matrix rendered by the frontend preferences page.
     *
     * @var list<string>
     */
    public const EVENTS = [
        'message_received',
        'booking_request',
        'booking_status_changed',
        'lease_payment_due',
        'lease_payment_overdue',
        // TCK-588 — le reçu d'un paiement avait l'interrupteur de l'échéance : couper
        // « échéance » coupait aussi « paiement reçu ».
        'lease_payment_received',
        // TCK-089 — fired when a lease is renewed/amended (parent → child).
        'lease_renewed',
        // TCK-090 — fired on every early-termination transition
        // (requested / cancelled / confirmed).
        'lease_early_termination',
        // TCK-091 — fired when the rent on an active lease is reviewed.
        'lease_rent_reviewed',
        // TCK-092 — fired by SendOverdueRemindersJob on each scheduled offset.
        'invoice_reminder_sent',
        'maintenance_status_changed',
        'review_received',
        'saved_search_match',
        'visit_reminder',
        'threshold_alert',
        // TCK-083 — fired by `tasks:send-due-reminders` ~24 h before due_at.
        'task_due_reminder',
        // TCK-266 — J+7 reminder when the move-in inventory is still unsigned
        // (sent to both the tenant and the agent / agency primary admin).
        'tenant_inventory_reminder',
        // TCK-599 — les alertes de favori, chacune son interrupteur : couper la baisse de prix ne
        // coupe pas l'indisponibilité.
        'favorite_price_drop',
        'favorite_unavailable',
        // TCK-2432 — l'annonce source d'un bien publié par le Radar a disparu : le bien est-il toujours disponible ?
        'property_availability_check',
        // TCK-2783 — `documents:remind-expiring` : une pièce du coffre expire dans 60 puis 7 jours.
        'document_expiring',
        // TCK-2985 (ADR-0132 § 6) — le résumé du lundi du bailleur : e-mail et WhatsApp seulement, éteints par défaut.
        self::OWNER_WEEKLY_DIGEST,
    ];

    /** TCK-2985 — le résumé du lundi du bailleur (`App\\Services\\Owners\\ResumeDuLundi`). */
    public const OWNER_WEEKLY_DIGEST = 'owner_weekly_digest';

    /**
     * TCK-2985 (ADR-0132 § 6) — les événements qu'une personne doit ALLUMER : toutes leurs cases sont éteintes par
     * défaut, e-mail compris, et l'activation se juge par {@see self::active()}, jamais par la case `inapp` (toujours
     * vraie). Leurs canaux sont ceux de {@see self::OPT_IN_CHANNELS}, sans `inapp` : ils n'entrent pas dans la cloche.
     *
     * @var list<string>
     */
    public const OPT_IN_EVENTS = [self::OWNER_WEEKLY_DIGEST];

    /** @var list<string> */
    public const OPT_IN_CHANNELS = [self::CHANNEL_EMAIL, self::CHANNEL_WHATSAPP];

    /**
     * Events that ignore user preferences on inapp + email.
     *
     * @var list<string>
     */
    public const CRITICAL_EVENTS = [
        'password_reset',
        'security_alert',
        'email_verification',
        // TCK-588 — le verdict KYC obéissait à « Alerte seuil KPI ». In-app et e-mail
        // toujours ; jamais de mobile forcé (la règle ci-dessous ne vaut que pour eux).
        'kyc_status_changed',
    ];

    /**
     * TCK-588 — les événements des classes `Notification` qui implémentent `SupportsSms` ou
     * `SupportsWhatsapp` : avec les événements des codes `mobile()`, ce sont les seuls dont
     * les cases `sms`/`whatsapp` commandent un envoi. `MobileClassEventsTest` garde la
     * réciprocité avec `app/Notifications/`, et qu'un émetteur réel envoie chacun.
     *
     * TCK-1053 (P75.01) — `booking_request` n'y est plus : `NewBookingNotification`, sans émetteur,
     * est retirée ; la demande de réservation ne part pas sur mobile (TCK-590, contrainte 4).
     *
     * @var list<string>
     */
    public const MOBILE_CLASS_EVENTS = [
        SavedSearchMatchesNotification::EVENT_TYPE,
        // TCK-2866 — l'alerte de seuil part sur WhatsApp quand l'alerte le choisit (jamais en SMS).
        ThresholdAlertTriggered::EVENT_TYPE,
    ];

    /**
     * TCK-599 (ADR-0050 §3) — les événements mobiles servis par WhatsApp SEUL (jamais de SMS : la
     * notification refuse le repli), et seulement quand leur drapeau le dit. Faux : aucune case
     * mobile n'est proposée, puisqu'aucun envoi ne l'honorerait.
     *
     * @return array<string, bool>
     */
    public static function whatsappOnlyEvents(): array
    {
        return [
            SavedSearchMatchesNotification::EVENT_TYPE => (bool) config('search_alerts.whatsapp_enabled'),
            // TCK-2866 — WhatsApp seul, sans repli SMS : l'admin a choisi WhatsApp, pas le SMS.
            ThresholdAlertTriggered::EVENT_TYPE => true,
        ];
    }

    /**
     * TCK-588 — défauts mobiles par événement (option retenue par défaut, question 1) :
     * WhatsApp et SMS sont activés pour ces événements, désactivables, et toujours soumis à
     * `phone_verified_at`. Coût SMS à la charge de la plateforme.
     *
     * @var list<string>
     */
    public const MOBILE_DEFAULT_EVENTS = [
        'lease_payment_due',
        'lease_payment_overdue',
        'visit_reminder',
        'booking_status_changed',
    ];

    /**
     * Default per-channel enablement when no row exists — hors défauts mobiles par événement
     * ({@see defaultFor()}, qui seul doit être lu).
     *
     * @var array<string,bool>
     */
    public const DEFAULTS = [
        self::CHANNEL_INAPP => true,
        self::CHANNEL_EMAIL => true,
        self::CHANNEL_PUSH => true,
        self::CHANNEL_SMS => false,
        self::CHANNEL_WHATSAPP => false,
    ];

    public function shouldSend(User $user, string $eventType, string $channel): bool
    {
        // inapp is always on — this is the source-of-truth feed.
        if ($channel === self::CHANNEL_INAPP) {
            return true;
        }

        // Critical system events ignore user preferences, but only on
        // inapp + email (we never force SMS/push).
        if (
            in_array($eventType, self::CRITICAL_EVENTS, true)
            && in_array($channel, [self::CHANNEL_EMAIL, self::CHANNEL_INAPP], true)
        ) {
            return true;
        }

        // SMS and WhatsApp require a verified phone regardless of preferences.
        if (
            in_array($channel, [self::CHANNEL_SMS, self::CHANNEL_WHATSAPP], true)
            && ! $user->phone_verified_at
        ) {
            return false;
        }

        // TCK-1094 (P72.02) — l'utilisateur a déclaré que son numéro ne reçoit pas WhatsApp
        // (`models-spec.md` § 1) : aucune préférence ne le contredit. `null` (« non dit ») garde
        // la préférence ou le défaut ; `resolveMobileChannel()` passe alors au SMS.
        if ($channel === self::CHANNEL_WHATSAPP && $user->phone_whatsapp === false) {
            return false;
        }

        $pref = NotificationPreference::query()
            ->where('user_id', $user->id)
            ->where('event_type', $eventType)
            ->where('channel', $channel)
            ->value('enabled');

        if ($pref === null) {
            return $this->defaultFor($eventType, $channel);
        }

        return (bool) $pref;
    }

    /**
     * TCK-2985 (ADR-0132 § 6) — l'événement à allumer l'est-il ? Une de ses cases {@see self::OPT_IN_CHANNELS} est
     * allumée, telle que la personne l'a choisie (ligne, sinon défaut éteint). Jamais `shouldSend(…, inapp)`, toujours
     * vrai ; et indépendamment du téléphone : la case WhatsApp allumée sans numéro vérifié active le résumé, qui part
     * alors par e-mail.
     */
    public function active(User $user, string $eventType): bool
    {
        $rows = NotificationPreference::query()
            ->where('user_id', $user->id)
            ->where('event_type', $eventType)
            ->whereIn('channel', self::OPT_IN_CHANNELS)
            ->pluck('enabled', 'channel');

        foreach (self::OPT_IN_CHANNELS as $channel) {
            if ($rows->has($channel) ? (bool) $rows->get($channel) : $this->defaultFor($eventType, $channel)) {
                return true;
            }
        }

        return false;
    }

    /** L'état d'une case quand l'utilisateur n'a rien choisi. */
    public function defaultFor(string $event, string $channel): bool
    {
        // TCK-2985 — un événement à allumer : rien par défaut, pas même l'e-mail.
        if (in_array($event, self::OPT_IN_EVENTS, true)) {
            return false;
        }

        if (
            in_array($channel, [self::CHANNEL_SMS, self::CHANNEL_WHATSAPP], true)
            && in_array($event, self::MOBILE_DEFAULT_EVENTS, true)
        ) {
            return true;
        }

        return self::DEFAULTS[$channel] ?? false;
    }

    /**
     * Les canaux qu'un envoi peut réellement honorer pour cet événement.
     *
     *   · `inapp` et `email` toujours ;
     *   · jamais `push` (TCK-2953) : aucune notification ne part plus par le canal `broadcast`
     *     (TCK-2952), le pilote `reverb` ne porte qu'un signal sans donnée (ADR-0129), et le porteur
     *     a exclu la notification push. La case reste dans la matrice, verrouillée ;
     *   · `sms`/`whatsapp` seulement si l'événement est mobile : un code `mobile()` l'a pour
     *     interrupteur, ou une classe `SupportsSms`/`SupportsWhatsapp` le porte.
     *
     * @return list<string>
     */
    public function channelsFor(string $event): array
    {
        // TCK-2985 — ses seuls canaux, sans `inapp` (cf. OPT_IN_EVENTS).
        if (in_array($event, self::OPT_IN_EVENTS, true)) {
            return self::OPT_IN_CHANNELS;
        }

        // TCK-2953 — plus de case `push` selon `broadcasting.default` : le transport temps réel ne livre
        // aucune notification (cf. docblock).
        $channels = [self::CHANNEL_INAPP, self::CHANNEL_EMAIL];

        $whatsappOnly = self::whatsappOnlyEvents();
        if (array_key_exists($event, $whatsappOnly)) {
            if ($whatsappOnly[$event]) {
                $channels[] = self::CHANNEL_WHATSAPP;
            }
        } elseif (in_array($event, self::mobileEvents(), true)) {
            $channels[] = self::CHANNEL_SMS;
            $channels[] = self::CHANNEL_WHATSAPP;
        }

        return $channels;
    }

    /** @return list<string> */
    public static function mobileEvents(): array
    {
        return array_values(array_unique([...NotificationCode::mobileEvents(), ...self::MOBILE_CLASS_EVENTS]));
    }

    /**
     * Helper for Notification::via(): filter a desired channel list against
     * the user's preferences.
     *
     * @param  list<string>  $channels
     * @return list<string>
     */
    public function filterChannels(User $user, string $eventType, array $channels): array
    {
        return array_values(array_filter(
            $channels,
            fn (string $channel) => $this->shouldSend($user, $eventType, $channel),
        ));
    }

    /**
     * TCK-282 — Pick the single mobile channel a dual-capable notification
     * should use: WhatsApp first (if the user opted in and the phone is
     * verified), else SMS, else none. Mutually exclusive by construction —
     * a notification never sends both `whatsapp` and `sms` (AC5). The
     * runtime WhatsApp-ineligible → SMS fallback (opted-out contact,
     * out-of-window without template, hard failure) is handled inside
     * {@see WhatsappChannel}, not here.
     */
    public function resolveMobileChannel(User $user, string $eventType): ?string
    {
        if ($this->shouldSend($user, $eventType, self::CHANNEL_WHATSAPP)) {
            return self::CHANNEL_WHATSAPP;
        }
        if ($this->shouldSend($user, $eventType, self::CHANNEL_SMS)) {
            return self::CHANNEL_SMS;
        }

        return null;
    }

    /**
     * Return the full matrix for a user (defaulting missing cells).
     *
     * @return list<array{event_type:string,channel:string,enabled:bool,locked:bool,reason?:string}>
     */
    public function matrixFor(User $user): array
    {
        $existing = NotificationPreference::query()
            ->where('user_id', $user->id)
            ->get()
            ->keyBy(fn (NotificationPreference $p) => "{$p->event_type}|{$p->channel}");

        $matrix = [];
        foreach (self::EVENTS as $event) {
            foreach (self::CHANNELS as $channel) {
                $key = "{$event}|{$channel}";
                $pref = $existing->get($key);
                $enabled = $pref ? (bool) $pref->enabled : $this->defaultFor($event, $channel);

                $locked = false;
                $reason = null;
                if ($channel === self::CHANNEL_INAPP) {
                    $locked = true;
                    $enabled = true;
                    $reason = 'inapp_always_on';
                } elseif (! in_array($channel, $this->channelsFor($event), true)) {
                    // TCK-588 — aucun envoi ne peut honorer cette case : la proposer cochable
                    // serait promettre un message qui ne partira jamais.
                    $locked = true;
                    $enabled = false;
                    $reason = 'channel_unavailable';
                } elseif (
                    in_array($channel, [self::CHANNEL_SMS, self::CHANNEL_WHATSAPP], true)
                    && ! $user->phone_verified_at
                ) {
                    $locked = true;
                    $enabled = false;
                    $reason = 'phone_not_verified';
                } elseif ($channel === self::CHANNEL_WHATSAPP && $user->phone_whatsapp === false) {
                    // TCK-1094 (P72.02) — même règle que `shouldSend()` : la case ne peut rien
                    // honorer, elle se verrouille et dit pourquoi (TCK-588).
                    $locked = true;
                    $enabled = false;
                    $reason = 'phone_without_whatsapp';
                }

                $cell = [
                    'event_type' => $event,
                    'channel' => $channel,
                    'enabled' => $enabled,
                    'locked' => $locked,
                ];
                if ($reason) {
                    $cell['reason'] = $reason;
                }
                $matrix[] = $cell;
            }
        }

        return $matrix;
    }

    /**
     * Bulk upsert user preferences. Silently ignores unknown event/channel
     * combinations and never flips locked cells.
     *
     * @param  list<array{event_type:string,channel:string,enabled:bool}>  $entries
     */
    public function updateMany(User $user, array $entries): void
    {
        foreach ($entries as $entry) {
            $event = $entry['event_type'] ?? null;
            $channel = $entry['channel'] ?? null;
            if (! in_array($event, self::EVENTS, true)) {
                continue;
            }
            if (! in_array($channel, self::CHANNELS, true)) {
                continue;
            }
            // Never persist preferences for locked channels.
            if ($channel === self::CHANNEL_INAPP) {
                continue;
            }
            // TCK-588 — ni pour une case qu'aucun envoi ne peut honorer.
            if (! in_array($channel, $this->channelsFor($event), true)) {
                continue;
            }

            NotificationPreference::updateOrCreate(
                [
                    'user_id' => $user->id,
                    'event_type' => $event,
                    'channel' => $channel,
                ],
                ['enabled' => (bool) ($entry['enabled'] ?? false)],
            );
        }
    }
}
