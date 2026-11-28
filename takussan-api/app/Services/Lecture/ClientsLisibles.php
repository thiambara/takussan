<?php

namespace App\Services\Lecture;

use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-3006 (ADR-0138) — qui peut lire une fiche client, pour la liste (`GET /api/customers`, et tout
 * ce qui lit `Customer::scopeVisibleTo` : kanban et compteurs du pipeline, doublons, suggestions de
 * la journée, export) et pour la fiche (`CustomerPolicy::view`, que `update` reprend). Deux faces
 * côte à côte ; `tests/Feature/Lecture/ListeEtFicheParityTest.php` les tient ensemble.
 *
 * Le super-admin lit tout. Sinon :
 *  1. l'auteur de la fiche (`added_by_id`), tant qu'elle est hors agence ou qu'il est encore MEMBRE
 *     actif de son agence (TCK-591, verif-591 M1), et jamais quand il en est le SUJET (TCK-2757 : le
 *     bailleur auteur de la fiche née de sa propre candidature ne lit pas ce que l'agence écrit de
 *     lui) ;
 *  2. le personnel de l'agence de la fiche, celle de son profil actif, qui y tient `crm.view_all`
 *     (TCK-587 : un bailleur rattaché lisait tout le CRM).
 */
final class ClientsLisibles
{
    /**
     * @param  Builder<Customer>  $query
     * @return Builder<Customer>
     */
    public static function restreindre(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $memberAgencyIds = app(MembershipCapabilityResolver::class)->memberAgencyIds($user);
        $staffAgencyId = $user->staffAgencyId();
        $agence = $query->qualifyColumn('agency_id');
        $sujet = $query->qualifyColumn('user_id');

        return $query->where(function (Builder $q) use ($user, $memberAgencyIds, $staffAgencyId, $agence, $sujet) {
            // 1.
            $q->where(fn (Builder $a) => $a->where($q->qualifyColumn('added_by_id'), $user->id)
                ->where(fn (Builder $s) => $s->whereNull($sujet)->orWhere($sujet, '!=', $user->id))
                ->where(fn (Builder $m) => $m->whereNull($agence)->orWhereIn($agence, $memberAgencyIds)));
            // 2. — la capacité jugée sur l'agence du profil actif, qui est celle de la branche.
            if ($staffAgencyId !== null && $user->can(Capability::CrmViewAll->value)) {
                $q->orWhere($agence, $staffAgencyId);
            }
        });
    }

    public static function peut(User $user, Customer $customer): bool
    {
        return $user->isSuperAdmin()
            // 1.
            || ((int) $customer->added_by_id === (int) $user->id
                && (int) $customer->user_id !== (int) $user->id
                && ($customer->agency_id === null
                    || app(MembershipCapabilityResolver::class)->isMemberAt($user, (int) $customer->agency_id)))
            // 2.
            || (AgenceDuLecteur::personnel($user, $customer->agency_id)
                && $user->can(Capability::CrmViewAll->value, $customer));
    }
}
