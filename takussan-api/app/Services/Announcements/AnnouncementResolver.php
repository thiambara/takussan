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
        if ($this->declaresNoRestriction($segment)) {
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

    /**
     * TCK-366 — un segment qui ne déclare AUCUNE restriction atteint tout le monde.
     *
     * Le test était `$segment === []`, et il ratait la forme que la console émet réellement :
     * `{"roles":[],"agency_ids":[]}`. Un tableau qui PORTE les clés du ciblage, vides, ne
     * restreint rien de plus qu'un tableau vide — c'est d'ailleurs ce que l'écran affirme, sa
     * cellule « Segment » rendant « Tous » exactement dans ce cas. Le résolveur disait l'inverse :
     * il tombait dans les trois branches de `matches()`, aucune ne matchait, et l'annonce
     * n'atteignait plus personne. Corriger la seule console aurait laissé la trappe ouverte pour
     * tout autre appelant — le corps est VALIDE au regard de `StoreAnnouncementRequest`
     * (`segment.roles` est `nullable|array`), donc rien ne le refuse à l'entrée.
     *
     * ⚠ Une clé INCONNUE n'est PAS traitée comme vide (`default => false`) : le résolveur reste
     * fail-closed. Diffuser à tout le monde un segment qu'on ne sait pas juger serait le défaut
     * symétrique, et le plus cher des deux.
     *
     * @param  array<string,mixed>  $segment
     */
    private function declaresNoRestriction(array $segment): bool
    {
        foreach ($segment as $cle => $valeur) {
            $vide = match ($cle) {
                'roles', 'agency_ids' => ! is_array($valeur) || $valeur === [],
                'rollout_percentage' => $valeur === null || (int) $valeur <= 0,
                default => false,
            };

            if (! $vide) {
                return false;
            }
        }

        return true;
    }

    public function bucket(int $announcementId, int $userId): int
    {
        return (int) (hexdec(substr(hash('xxh3', "{$announcementId}:{$userId}"), 0, 8)) % 100);
    }
}
