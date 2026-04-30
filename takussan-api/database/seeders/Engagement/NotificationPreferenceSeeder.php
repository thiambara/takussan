<?php

namespace Database\Seeders\Engagement;

use App\Models\NotificationPreference;
use App\Models\User;
use App\Services\Notifications\PreferenceResolver;
use Illuminate\Database\Seeder;

/**
 * TCK-070 — Backfill default notification preferences for existing users.
 *
 * Per the spec: inapp + email ON by default, SMS off, push ON by default.
 * Only fills cells that don't already exist — idempotent and safe to rerun.
 */
class NotificationPreferenceSeeder extends Seeder
{
    public function run(): void
    {
        $users = User::query()->get(['id']);
        $rows = [];
        $now = now();

        foreach ($users as $user) {
            foreach (PreferenceResolver::EVENTS as $event) {
                foreach (PreferenceResolver::CHANNELS as $channel) {
                    if ($channel === PreferenceResolver::CHANNEL_INAPP) {
                        continue; // not persisted, always on
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
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            NotificationPreference::query()->insertOrIgnore($chunk);
        }
    }
}
