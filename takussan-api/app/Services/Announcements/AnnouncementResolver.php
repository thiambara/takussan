<?php

namespace App\Services\Announcements;

use App\Models\Announcement;
use App\Models\AnnouncementDismissal;
use App\Models\Enums\AnnouncementSeverity;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class AnnouncementResolver
{
    /**
     * @return Collection<int, Announcement>
     */
    public function activeFor(User $user): Collection
    {
        return Announcement::query()
            ->currentlyVisible()
            ->whereDoesntHave('dismissals', fn (Builder $query) => $query->where('user_id', $user->id))
            ->orderByDesc('severity')
            ->orderBy('starts_at')
            ->get()
            ->filter(fn (Announcement $announcement) => $this->matches($announcement, $user))
            ->values();
    }

    public function dismiss(Announcement $announcement, User $user): ?AnnouncementDismissal
    {
        if ($announcement->severity === AnnouncementSeverity::Critical && $announcement->is_active) {
            return null;
        }

        return AnnouncementDismissal::query()->firstOrCreate(
            ['announcement_id' => $announcement->id, 'user_id' => $user->id],
            ['dismissed_at' => now()],
        );
    }

    public function matches(Announcement $announcement, User $user): bool
    {
        $segment = $announcement->segment ?? [];
        if ($segment === []) {
            return true;
        }

        $matched = false;

        $roles = $segment['roles'] ?? [];
        if (is_array($roles) && $roles !== []) {
            $matched = collect($roles)->intersect($user->profileTypes())->isNotEmpty();
        }

        $agencyIds = $segment['agency_ids'] ?? [];
        if (! $matched && is_array($agencyIds) && $agencyIds !== [] && $user->agency_id !== null) {
            $matched = in_array((int) $user->agency_id, array_map('intval', $agencyIds), true);
        }

        $percentage = (int) ($segment['rollout_percentage'] ?? 0);
        if (! $matched && $percentage > 0) {
            $matched = $this->bucket($announcement->id, $user->id) < min($percentage, 100);
        }

        return $matched;
    }

    public function bucket(int $announcementId, int $userId): int
    {
        return (int) (hexdec(substr(hash('xxh3', "{$announcementId}:{$userId}"), 0, 8)) % 100);
    }
}
