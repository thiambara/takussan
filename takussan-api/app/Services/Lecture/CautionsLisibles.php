<?php

namespace App\Services\Lecture;

use App\Models\Guarantor;
use App\Models\User;
use App\Policies\BasePolicy;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-3006 (ADR-0138) — qui peut lire une caution, pour la liste (`GET /api/guarantors`) et pour la
 * fiche (`GuarantorPolicy::view`, que `update` et `delete` reprennent). Deux faces côte à côte ;
 * `tests/Feature/Lecture/ListeEtFicheParityTest.php` les tient ensemble.
 *
 * Le super-admin lit tout. Sinon :
 *  1. celui qui l'a ajoutée, tant qu'elle est hors agence ou qu'il est encore membre de son agence
 *     (la règle d'auteur d'ADR-0031, amendement du 2026-10-24) ;
 *  2. le personnel de l'agence de la caution, celle de son profil actif (TCK-587).
 *
 * Avant TCK-3006, la liste ne rendait que les cautions ajoutées par l'appelant, quand la fiche
 * ouvrait toute caution de l'agence au personnel ; et l'auteur parti gardait la fiche sans
 * condition. L'agence est la COLONNE `agency_id` (TCK-1993), sans le repli sur l'agence de
 * l'auteur que garde `GuarantorPolicy::agencyOf()` pour la pièce en clair : ce repli lit l'agence
 * du profil d'un tiers, qui n'a pas de forme SQL, et une caution sans agence reste à son auteur.
 */
final class CautionsLisibles
{
    /**
     * @param  Builder<Guarantor>  $query
     * @return Builder<Guarantor>
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
            $q->where(fn (Builder $a) => $a->where($q->qualifyColumn('added_by_id'), $user->id)
                ->where(fn (Builder $m) => $m->whereNull($agence)->orWhereIn($agence, $memberAgencyIds)));
            // 2.
            if ($staffAgencyId !== null) {
                $q->orWhere($agence, $staffAgencyId);
            }
        });
    }

    public static function peut(User $user, Guarantor $guarantor): bool
    {
        return $user->isSuperAdmin()
            // 1.
            || BasePolicy::auteurEncoreMembre($user, $guarantor->added_by_id, $guarantor->agency_id)
            // 2.
            || AgenceDuLecteur::personnel($user, $guarantor->agency_id);
    }
}
