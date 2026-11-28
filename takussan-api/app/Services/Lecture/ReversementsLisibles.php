<?php

namespace App\Services\Lecture;

use App\Models\Enums\Capability;
use App\Models\Payout;
use App\Models\User;
use App\Policies\BasePolicy;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-3006 (ADR-0138) — qui peut lire un reversement, pour la liste (`GET /api/payouts`) et pour la
 * fiche (`PayoutPolicy::view`). Deux faces côte à côte, branche par branche ;
 * `tests/Feature/Lecture/ListeEtFicheParityTest.php` les tient ensemble.
 *
 * Le super-admin lit tout. Sinon :
 *  1. le BÉNÉFICIAIRE (`landlord_id`) ;
 *  2. l'émetteur, tant que le reversement est hors agence ou qu'il est encore membre de son agence
 *     (P218.03, TCK-2196) ;
 *  3. le personnel de l'agence du reversement (profil actif) qui y tient `payouts.create` (TCK-587 :
 *     un bailleur de l'agence lisait les versements de tous les autres).
 */
final class ReversementsLisibles
{
    /**
     * @param  Builder<Payout>  $query
     * @return Builder<Payout>
     */
    public static function restreindre(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $memberAgencyIds = app(MembershipCapabilityResolver::class)->memberAgencyIds($user);
        $staffAgencyId = $user->staffAgencyId();
        $agence = $query->qualifyColumn('agency_id');

        return $query->where(function (Builder $q) use ($user, $memberAgencyIds, $staffAgencyId, $agence) {
            // 1.
            $q->where($q->qualifyColumn('landlord_id'), $user->id)
                // 2.
                ->orWhere(fn (Builder $a) => $a->where($q->qualifyColumn('issued_by_id'), $user->id)
                    ->where(fn (Builder $m) => $m->whereNull($agence)->orWhereIn($agence, $memberAgencyIds)));
            // 3. — la capacité jugée sur l'agence du profil actif, qui est celle de la branche.
            if ($staffAgencyId !== null && $user->can(Capability::PayoutsCreate->value)) {
                $q->orWhere($agence, $staffAgencyId);
            }
        });
    }

    public static function peut(User $user, Payout $payout): bool
    {
        return $user->isSuperAdmin()
            // 1.
            || (int) $payout->landlord_id === (int) $user->id
            // 2.
            || BasePolicy::auteurEncoreMembre($user, $payout->issued_by_id, $payout->agency_id)
            // 3.
            || (AgenceDuLecteur::personnel($user, $payout->agency_id) && $user->can(Capability::PayoutsCreate->value, $payout));
    }
}
