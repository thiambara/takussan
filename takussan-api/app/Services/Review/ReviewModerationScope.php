<?php

namespace App\Services\Review;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

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
 */
class ReviewModerationScope
{
    /** L'agence dont l'acteur modère les avis, ou `null` s'il n'en modère aucune. */
    public function agencyFor(User $user): ?int
    {
        $agencyId = $user->agency_id;
        if ($agencyId === null || ! $user->isAgencyAdminAt((int) $agencyId)) {
            return null;
        }

        $kind = Agency::query()->whereKey($agencyId)->first(['id', 'kind'])?->kind;

        return $kind === AgencyKind::Standard ? (int) $agencyId : null;
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
        if ($user->isSuperAdmin()) {
            return true;
        }

        return $this->inAgencyScope($user, $review)
            && $review->status === ReviewStatus::Pending
            && ($decision === null || in_array($decision, self::AGENCY_DECISIONS, true));
    }

    /** L'avis relève de l'agence que l'acteur modère, quel que soit son statut. */
    public function inAgencyScope(User $user, Review $review): bool
    {
        if ($user->isSuperAdmin()) {
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
        if ($user->isSuperAdmin()) {
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
        $statuses = $user->isSuperAdmin()
            ? [ReviewStatus::Pending->value, ReviewStatus::Reported->value]
            : [ReviewStatus::Pending->value];

        return $this->restrict(Review::query(), $user, moderatableOnly: true)
            ->whereIn('status', $statuses)
            ->count();
    }
}
