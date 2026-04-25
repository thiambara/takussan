<?php

namespace App\Services\Notifications;

use App\Models\NotificationPreference;
use App\Models\User;

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
 * triple, {@see DEFAULTS} kicks in (inapp + email on, sms/push off).
 */
class PreferenceResolver
{
    public const CHANNEL_INAPP = 'inapp';

    public const CHANNEL_EMAIL = 'email';

    public const CHANNEL_SMS = 'sms';

    public const CHANNEL_PUSH = 'push';

    /** @var list<string> */
    public const CHANNELS = [self::CHANNEL_INAPP, self::CHANNEL_EMAIL, self::CHANNEL_PUSH, self::CHANNEL_SMS];

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
    ];

    /**
     * Events that ignore user preferences on inapp + email.
     *
     * @var list<string>
     */
    public const CRITICAL_EVENTS = [
        'password_reset',
        'security_alert',
        'email_verification',
    ];

    /**
     * Default per-channel enablement when no row exists.
     *
     * @var array<string,bool>
     */
    public const DEFAULTS = [
        self::CHANNEL_INAPP => true,
        self::CHANNEL_EMAIL => true,
        self::CHANNEL_PUSH => true,
        self::CHANNEL_SMS => false,
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

        // SMS requires a verified phone regardless of preferences.
        if ($channel === self::CHANNEL_SMS && ! $user->phone_verified_at) {
            return false;
        }

        $pref = NotificationPreference::query()
            ->where('user_id', $user->id)
            ->where('event_type', $eventType)
            ->where('channel', $channel)
            ->value('enabled');

        if ($pref === null) {
            return self::DEFAULTS[$channel] ?? false;
        }

        return (bool) $pref;
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
                $enabled = $pref ? (bool) $pref->enabled : (self::DEFAULTS[$channel] ?? false);

                $locked = false;
                $reason = null;
                if ($channel === self::CHANNEL_INAPP) {
                    $locked = true;
                    $enabled = true;
                    $reason = 'inapp_always_on';
                } elseif ($channel === self::CHANNEL_SMS && ! $user->phone_verified_at) {
                    $locked = true;
                    $enabled = false;
                    $reason = 'phone_not_verified';
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
