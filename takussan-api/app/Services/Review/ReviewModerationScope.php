<?php

namespace App\Services\Review;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use WeakMap;

/**
 * TCK-597 (ADR-0043 §1) — QUI modère QUELS avis, écrit une fois.
 *
 * L'admin d'agence modère les avis dont `reviews.agency_id` est l'agence de son PROFIL ACTIF, à
 * condition d'y tenir un `AgencyAdminProfile` actif et que l'agence soit `standard`, et seulement
 * pour une cible bien ou agent ({@see Review::AGENCY_MODERATED_TYPES}). Le reste — avis sur
 * l'agence, sur un prestataire, d'une agence `individual`, sans agence — relève de la plateforme.
 *
 * L'ancienne expression (`isAgencyAdminAt($user->agency_id)`) ouvrait le geste à l'admin de
 * N'IMPORTE QUELLE agence, sur les avis de toutes les agences : elle ne comparait jamais l'agence
 * de l'avis à celle de l'acteur.
 *
 * verif-597 passe 2 n2 — ce qui ne dépend que de l'ACTEUR (son agence modérée, le genre de
 * celle-ci, son agence de personnel, ses profils dans une agence) se calcule UNE fois par requête :
 * `ReviewResource` interroge la policy pour chaque avis d'une liste, et chaque ligne relisait tout
 * (412 requêtes pour 50 avis). La mémoire est rangée sous l'objet `Request` courant, jamais sous
 * l'instance seule : une requête neuve repart à vide, et l'instance est `scoped` (remise à zéro
 * entre deux jobs de la file).
 */
class ReviewModerationScope
{
    /** @var WeakMap<Request, array<string, mixed>> */
    private WeakMap $memo;

    public function __construct(private readonly MembershipCapabilityResolver $resolver)
    {
        $this->memo = new WeakMap;
    }

    /** L'agence dont l'acteur modère les avis, ou `null` s'il n'en modère aucune. */
    public function agencyFor(User $user): ?int
    {
        return $this->remember($user, 'agencyFor', function () use ($user): ?int {
            $agencyId = $user->agency_id;
            if ($agencyId === null || ! $user->isAgencyAdminAt((int) $agencyId)) {
                return null;
            }

            $kind = Agency::query()->whereKey($agencyId)->first(['id', 'kind'])?->kind;

            return $kind === AgencyKind::Standard ? (int) $agencyId : null;
        });
    }

    /** {@see MembershipCapabilityResolver::staffAgencyId()}, une fois par requête. */
    public function staffAgencyId(User $user): ?int
    {
        return $this->remember($user, 'staffAgencyId', fn (): ?int => $this->resolver->staffAgencyId($user));
    }

    /** {@see MembershipCapabilityResolver::isStaffAt()}, une fois par requête et par agence. */
    public function isStaffAt(User $user, int $agencyId): bool
    {
        return $this->remember($user, "isStaffAt:{$agencyId}", fn (): bool => $this->resolver->isStaffAt($user, $agencyId));
    }

    /** Bailleur actif de l'agence, une fois par requête et par agence. */
    public function isOwnerAt(User $user, int $agencyId): bool
    {
        return $this->remember($user, "isOwnerAt:{$agencyId}", fn (): bool => $user->isOwnerAt($agencyId));
    }

    private function isSuperAdmin(User $user): bool
    {
        return $this->remember($user, 'isSuperAdmin', fn (): bool => $user->isSuperAdmin());
    }

    /**
     * @template T
     *
     * @param  Closure(): T  $compute
     * @return T
     */
    private function remember(User $user, string $key, Closure $compute): mixed
    {
        $request = app('request');
        $bucket = $this->memo[$request] ?? [];
        $slot = $user->getKey().'|'.$key;

        if (! array_key_exists($slot, $bucket)) {
            $bucket[$slot] = $compute();
            $this->memo[$request] = $bucket;
        }

        return $bucket[$slot];
    }

    /**
     * Les décisions de l'admin d'agence : approuver ou masquer un avis AVANT sa publication
     * (verif-597 M3). Retirer, ignorer des signalements, revenir sur un avis publié : plateforme.
     */
    public const AGENCY_DECISIONS = ['approve', 'hide'];

    /**
     * Trancher un avis. L'admin d'agence ne tranche que l'avis EN ATTENTE de son périmètre
     * (verif-597 M3, ADR-0043 §1) : une fois publié, l'avis la juge — retirer un 1★ de son propre
     * bien faisait monter sa moyenne publique. Il garde la réponse et le signalement.
     */
    public function canModerate(User $user, Review $review, ?string $decision = null): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }

        return $this->inAgencyScope($user, $review)
            && $review->status === ReviewStatus::Pending
            && ($decision === null || in_array($decision, self::AGENCY_DECISIONS, true));
    }

    /** L'avis relève de l'agence que l'acteur modère, quel que soit son statut. */
    public function inAgencyScope(User $user, Review $review): bool
    {
        if ($this->isSuperAdmin($user)) {
            return true;
        }

        $agencyId = $this->agencyFor($user);

        return $agencyId !== null
            && $review->isAgencyModerated()
            && $review->agency_id !== null
            && (int) $review->agency_id === $agencyId;
    }

    /**
     * Restreint une requête d'avis au périmètre de l'agence modérée. Le super-admin garde tout.
     *
     * @param  Builder<Review>  $query
     * @return Builder<Review>
     */
    public function restrict(Builder $query, User $user, bool $moderatableOnly = false): Builder
    {
        if ($this->isSuperAdmin($user)) {
            return $query;
        }

        $agencyId = $this->agencyFor($user);
        if ($agencyId === null) {
            return $query->whereRaw('1 = 0');
        }

        $query->where('reviews.agency_id', $agencyId);

        if ($moderatableOnly) {
            $query->whereIn('reviews.reviewable_type', Review::AGENCY_MODERATED_TYPES);
        }

        return $query;
    }

    /**
     * Le compteur de la file : les avis que l'acteur peut trancher. Pour l'admin d'agence, les
     * seuls avis en attente (verif-597 M3) ; un avis signalé relève de la plateforme.
     */
    public function pendingCount(User $user): int
    {
        $statuses = $this->isSuperAdmin($user)
            ? [ReviewStatus::Pending->value, ReviewStatus::Reported->value]
            : [ReviewStatus::Pending->value];

        return $this->restrict(Review::query(), $user, moderatableOnly: true)
            ->whereIn('status', $statuses)
            ->count();
    }
}
