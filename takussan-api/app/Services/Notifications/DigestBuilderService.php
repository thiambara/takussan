<?php

namespace App\Services\Notifications;

use App\Models\AppNotification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * TCK-103 — Collects and groups eligible notifications for a user's digest.
 *
 * "Eligible" means: unread, not yet digested, not critical, created within
 * the given time window. Results are grouped by NotificationType value so
 * the mail template can render them by category.
 */
class DigestBuilderService
{
    public const MAX_NOTIFICATIONS = 50;

    /**
     * Build digest payload for a user.
     *
     * @return Collection<string, Collection<int, AppNotification>> keyed by type value
     */
    public function buildForUser(User $user, Carbon $windowStart): Collection
    {
        $notifications = AppNotification::query()
            ->where('user_id', $user->id)
            ->where('is_read', false)
            ->whereNull('digested_at')
            ->where('created_at', '>=', $windowStart)
            ->orderByDesc('created_at')
            ->limit(self::MAX_NOTIFICATIONS)
            ->get()
            ->filter(fn (AppNotification $n) => ! $n->isCritical());

        return $notifications->groupBy(fn (AppNotification $n) => $n->type->value);
    }

    /**
     * Mark all given notifications as digested.
     *
     * @param  Collection<int, AppNotification>  $notifications
     */
    public function markDigested(Collection $notifications): void
    {
        $ids = $notifications->pluck('id')->all();
        if (empty($ids)) {
            return;
        }

        AppNotification::whereIn('id', $ids)->update(['digested_at' => now()]);
    }

    /**
     * Flatten a grouped collection for marking purposes.
     *
     * @param  Collection<string, Collection<int, AppNotification>>  $grouped
     * @return Collection<int, AppNotification>
     */
    public function flatten(Collection $grouped): Collection
    {
        return $grouped->flatten(1);
    }
}
