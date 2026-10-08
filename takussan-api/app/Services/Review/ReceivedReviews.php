<?php

namespace App\Services\Review;

use App\Models\Enums\ReviewStatus;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-597 (ADR-0043 §6, AC7) — la boîte des avis REÇUS d'un acteur.
 *
 *  - les avis PUBLIÉS sur les biens qu'il a publiés ou dont il est collaborateur ;
 *  - les avis PUBLIÉS qui le visent : lui comme agent, son profil prestataire ;
 *  - pour l'admin actif d'une agence : tous les avis de l'agence (`reviews.agency_id`), en attente
 *    compris — c'est aussi lui qui les modère.
 *
 * Un avis rejeté n'y figure jamais. Un agent ne voit pas les biens d'un autre agent de l'agence :
 * le périmètre part du bien, pas de l'agence.
 */
class ReceivedReviews
{
    /** @return Builder<Review> */
    public function for(User $user): Builder
    {
        $adminAgencyId = $this->adminAgency($user);

        return Review::query()
            ->where('reviews.status', '!=', ReviewStatus::Rejected->value)
            ->where(function (Builder $scope) use ($user, $adminAgencyId) {
                $scope->where(fn (Builder $published) => $published
                    ->where('reviews.is_approved', true)
                    ->where(fn (Builder $mine) => $this->targetsActor($mine, $user)));

                if ($adminAgencyId !== null) {
                    $scope->orWhere('reviews.agency_id', $adminAgencyId);
                }
            });
    }

    /** @param  Builder<Review>  $query */
    private function targetsActor(Builder $query, User $user): void
    {
        $query
            ->where(fn (Builder $q) => $q
                ->where('reviews.reviewable_type', Property::class)
                ->whereIn('reviews.reviewable_id', Property::query()->select('id')->where(fn (Builder $p) => $p
                    ->where('user_id', $user->id)
                    ->orWhereIn('id', PropertyCollaborator::query()->select('property_id')->where('user_id', $user->id)))))
            ->orWhere(fn (Builder $q) => $q
                ->where('reviews.reviewable_type', User::class)
                ->where('reviews.reviewable_id', $user->id))
            ->orWhere(fn (Builder $q) => $q
                ->where('reviews.reviewable_type', ServiceProviderProfile::class)
                ->whereIn('reviews.reviewable_id', ServiceProviderProfile::query()->select('id')->where('user_id', $user->id)));
    }

    /** L'agence du profil actif, si l'acteur y est admin actif — quel que soit le genre d'agence. */
    private function adminAgency(User $user): ?int
    {
        $agencyId = $user->agency_id;

        return $agencyId !== null && $user->isAgencyAdminAt((int) $agencyId) ? (int) $agencyId : null;
    }
}
