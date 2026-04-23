<?php

namespace App\Observers;

use App\Models\NotificationPreference;
use App\Models\User;
use App\Services\Notifications\PreferenceResolver;

/**
 * TCK-070 — Auto-provision notification preference rows on user creation.
 *
 * The resolver already falls back to defaults when rows are missing, but
 * materializing the matrix upfront simplifies the UI contract and ensures
 * explicit audit logging (a later ticket) works out of the box.
 */
class UserObserver
{
    public function created(User $user): void
    {
        $now = now();
        $rows = [];
        foreach (PreferenceResolver::EVENTS as $event) {
            foreach (PreferenceResolver::CHANNELS as $channel) {
                if ($channel === PreferenceResolver::CHANNEL_INAPP) {
                    continue;
                }
                $rows[] = [
                    'user_id' => $user->id,
                    'event_type' => $event,
                    'channel' => $channel,
                    'enabled' => PreferenceResolver::DEFAULTS[$channel] ?? false,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
        }

        NotificationPreference::query()->insertOrIgnore($rows);
    }
}
