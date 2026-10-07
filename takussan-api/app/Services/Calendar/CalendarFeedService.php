<?php

namespace App\Services\Calendar;

use App\Models\CalendarFeed;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * TCK-591 (ADR-0034) — le cycle de vie d'un lien d'abonnement d'agenda.
 *
 * Un lien actif par couple (utilisateur, agence) ; créer fait tourner (l'ancien est révoqué dans la
 * même transaction) ; le jeton en clair n'existe qu'au retour de {@see self::issue()}.
 */
class CalendarFeedService
{
    /** Fenêtre du flux : 30 jours en arrière, 180 en avant — sous la borne de 186 jours. */
    public const PAST_DAYS = 30;

    public const FUTURE_DAYS = 180;

    public function __construct(
        private readonly CalendarEventCollector $collector,
    ) {}

    /**
     * @return array{feed: CalendarFeed, token: string}
     */
    public function issue(User $user, ?int $agencyId): array
    {
        $token = Str::random(40);

        $feed = DB::transaction(function () use ($user, $agencyId, $token) {
            $this->revokeQuery($user, $agencyId)->update(['revoked_at' => now()]);

            return CalendarFeed::query()->create([
                'user_id' => $user->id,
                'agency_id' => $agencyId,
                'token_hash' => CalendarFeed::hashToken($token),
            ]);
        });

        activity('CalendarFeed')
            ->causedBy($user)
            ->performedOn($feed)
            ->withProperties(['agency_id' => $agencyId])
            ->event('issued')
            ->log('calendar_feed.issued');

        return ['feed' => $feed, 'token' => $token];
    }

    /** Révoque le lien actif du couple ; rend le nombre de liens révoqués. */
    public function revoke(User $user, ?int $agencyId): int
    {
        $count = $this->revokeQuery($user, $agencyId)->update(['revoked_at' => now()]);

        if ($count > 0) {
            activity('CalendarFeed')
                ->causedBy($user)
                ->withProperties(['agency_id' => $agencyId, 'user_id' => $user->id])
                ->event('revoked')
                ->log('calendar_feed.revoked');
        }

        return $count;
    }

    /**
     * Le lien actif d'un jeton, ou `null` — inconnu, révoqué, ou dont le titulaire n'est plus
     * PERSONNEL de l'agence du lien (une suspension éteint le flux sans écriture).
     */
    public function resolve(string $token): ?CalendarFeed
    {
        $feed = CalendarFeed::query()
            ->active()
            ->where('token_hash', CalendarFeed::hashToken($token))
            ->with('user')
            ->first();

        if ($feed === null || $feed->user === null) {
            return null;
        }

        // TCK-587 — prédicat « personnel de l'agence », remplacé par `isStaffAt()` à sa fusion.
        if ($feed->agency_id !== null
            && ! $feed->user->isAgentAt((int) $feed->agency_id)
            && ! $feed->user->isAgencyAdminAt((int) $feed->agency_id)) {
            return null;
        }

        return $feed;
    }

    /**
     * Les événements du flux : « Mes rendez-vous » du titulaire dans l'agence du lien.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function events(CalendarFeed $feed): Collection
    {
        $now = Carbon::now();

        return $this->collector->collect(
            user: $feed->user,
            staffAgencyId: $feed->agency_id !== null ? (int) $feed->agency_id : null,
            start: $now->copy()->subDays(self::PAST_DAYS)->startOfDay(),
            end: $now->copy()->addDays(self::FUTURE_DAYS)->endOfDay(),
            types: CalendarEventCollector::TYPES,
            mine: true,
        );
    }

    public function touch(CalendarFeed $feed): void
    {
        $feed->forceFill(['last_accessed_at' => now()])->saveQuietly();
    }

    /** @return Builder<CalendarFeed> */
    private function revokeQuery(User $user, ?int $agencyId)
    {
        return CalendarFeed::query()
            ->active()
            ->where('user_id', $user->id)
            ->when(
                $agencyId === null,
                fn ($q) => $q->whereNull('agency_id'),
                fn ($q) => $q->where('agency_id', $agencyId),
            );
    }
}
