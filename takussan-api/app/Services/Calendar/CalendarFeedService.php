<?php

namespace App\Services\Calendar;

use App\Models\CalendarFeed;
use App\Models\Enums\UserStatus;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * TCK-591 (ADR-0034) — le cycle de vie d'un lien d'abonnement d'agenda.
 *
 * Un lien actif par couple (utilisateur, agence) ; créer fait tourner (l'ancien est révoqué dans la
 * même transaction). Le jeton en clair sort au retour de {@see self::issue()} ; ensuite, seule sa
 * copie chiffrée le rend à son titulaire (TCK-2887, ADR-0121), et toute révocation l'efface.
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
        // TCK-591 (verif-591 B1, ADR-0034 §2) — un lien hors agence n'existe que pour le prestataire.
        // Un agent retiré, qui n'est plus personnel nulle part, en recevait un neuf que le retrait
        // ne pouvait pas couper.
        if ($agencyId === null && ! $this->mayHoldAgencylessFeed($user)) {
            // TCK-617 — le personnel d'au moins une agence qui n'en a pas choisi n'est pas « hors
            // personnel » : il doit choisir l'agence du lien. Même refus, message juste.
            abort_code(403, app(MembershipCapabilityResolver::class)->staffAgencyIds($user) !== []
                ? 'calendar.feed_agency_required'
                : 'calendar.feed_not_staff');
        }

        $token = Str::random(40);

        $feed = DB::transaction(function () use ($user, $agencyId, $token) {
            $this->revokeQuery($user, $agencyId)->update(self::revocation());

            return CalendarFeed::query()->create([
                'user_id' => $user->id,
                'agency_id' => $agencyId,
                'token_hash' => CalendarFeed::hashToken($token),
                // TCK-2887 (ADR-0121) — la copie chiffrée, pour relire le lien à la réouverture.
                'token_encrypted' => $token,
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
        $count = $this->revokeQuery($user, $agencyId)->update(self::revocation());

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
     * TCK-617 (décision du porteur, 2026-11-16) — un geste qui fait sortir le titulaire du personnel
     * de l'agence (fin de délégation, passage au rôle de bailleur) révoque le lien de cette agence.
     * {@see self::resolve()} l'éteignait déjà à la lecture, mais sans écriture le lien revivait le
     * jour où le titulaire redevenait personnel. Rend le nombre de liens révoqués.
     */
    public function revokeUnlessStaff(User $user, int $agencyId): int
    {
        return app(MembershipCapabilityResolver::class)->isStaffAt($user, $agencyId)
            ? 0
            : $this->revoke($user, $agencyId);
    }

    /**
     * TCK-2887 (ADR-0121 § 4) — l'écriture de TOUTE révocation : le lien meurt et sa copie chiffrée
     * avec lui. À employer par chaque voie qui pose `revoked_at` (rotation, révocation, blocage, effacement du compte).
     *
     * @return array{revoked_at: Carbon, token_encrypted: null}
     */
    public static function revocation(): array
    {
        return ['revoked_at' => now(), 'token_encrypted' => null];
    }

    /**
     * Le lien actif d'un jeton, ou `null` — inconnu, révoqué, ou dont le titulaire n'est plus
     * PERSONNEL de l'agence du lien. Ce refus à la lecture est le filet ; depuis TCK-617, chaque geste
     * qui fait sortir du personnel (suspension, retrait, fin de délégation, changement de rôle)
     * révoque aussi le lien par écriture, pour qu'il ne revive pas à la réactivation.
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

        // TCK-591 (verif-591 M4) — un compte qui n'est plus actif (bloqué) ne reçoit plus son flux,
        // même si un lien a survécu au blocage.
        if ($feed->user->status !== UserStatus::Active) {
            return null;
        }

        // TCK-587 — le porteur du flux doit rester PERSONNEL actif de l'agence du flux.
        if ($feed->agency_id !== null
            && ! app(MembershipCapabilityResolver::class)->isStaffAt($feed->user, (int) $feed->agency_id)) {
            return null;
        }

        // TCK-591 (verif-591 B1) — un lien hors agence n'est servi qu'à un prestataire.
        if ($feed->agency_id === null && ! $this->mayHoldAgencylessFeed($feed->user)) {
            return null;
        }

        return $feed;
    }

    /**
     * ADR-0034 §2 — le lien sans agence est celui du prestataire, qui n'est personnel nulle part. Le
     * super-admin n'en tient pas (verif-591 passe 2, N3) : sans borne d'agence, son lien servait les
     * réservations de toute la plateforme à quiconque détenait l'URL.
     */
    public function mayHoldAgencylessFeed(User $user): bool
    {
        return $user->serviceProviderProfile()->active()->exists();
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
