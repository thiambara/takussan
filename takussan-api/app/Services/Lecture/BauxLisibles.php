<?php

namespace App\Services\Lecture;

use App\Models\Lease;
use App\Models\User;
use App\Services\Property\BailleurDuBien;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-3006 (ADR-0138) — qui peut lire un bail, pour la liste (`GET /api/leases`, et tout ce qui lit
 * `Lease::scopeVisibleTo` : occupation des biens, filtres `tenant` et `rent_late`, tri du retard,
 * salles de messagerie) et pour la fiche (`LeasePolicy::view`). Deux faces côte à côte ;
 * `tests/Feature/Lecture/ListeEtFicheParityTest.php` les tient ensemble.
 *
 * Le super-admin lit tout. Sinon :
 *  1. le bailleur DÉSIGNÉ par `landlord_id`, propriétaire dans l'agence du bail ou bail hors agence,
 *     de tout statut ({@see BailleurDuBien}, TCK-1926 : l'agent qui a saisi le bien lit au titre du
 *     personnel) ;
 *  2. le locataire (le compte de la fiche `tenant_id`) ;
 *  3. le personnel de l'agence du bail, celle de son profil actif (TCK-587).
 *
 * Colonnes qualifiées : la face SQL est posée dans des sous-requêtes (`whereHas('currentLease')`,
 * `whereIn(… select('leases.id'))`) où `agency_id` serait ambigu.
 */
final class BauxLisibles
{
    /**
     * @param  Builder<Lease>  $query
     * @return Builder<Lease>
     */
    public static function restreindre(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $staffAgencyId = $user->staffAgencyId();

        return $query->where(function (Builder $q) use ($user, $staffAgencyId) {
            // 1.
            $q->where(fn ($b) => BailleurDuBien::restreindre($b, $user, $q->qualifyColumn('landlord_id'), $q->qualifyColumn('agency_id')))
                // 2.
                ->orWhereHas('tenant', fn ($t) => $t->where('user_id', $user->id));
            // 3.
            if ($staffAgencyId !== null) {
                $q->orWhere($q->qualifyColumn('agency_id'), $staffAgencyId);
            }
        });
    }

    public static function peut(User $user, Lease $lease): bool
    {
        return $user->isSuperAdmin()
            // 1.
            || BailleurDuBien::est($user, $lease->landlord_id, $lease->agency_id)
            // 2.
            || ($lease->tenant !== null && (int) $lease->tenant->user_id === (int) $user->id)
            // 3.
            || AgenceDuLecteur::personnel($user, $lease->agency_id);
    }
}
