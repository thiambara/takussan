<?php

namespace App\Services\Lecture;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use App\Policies\TaskPolicy;
use App\Rules\PersonnelDeLAgence;
use App\Services\Agency\AgentAvailability;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

/**
 * TCK-3006 (ADR-0138) — qui peut lire une tâche, pour la liste (`GET /api/tasks`) et pour la fiche
 * (`TaskPolicy::view`). Deux faces côte à côte ; `tests/Feature/Lecture/ListeEtFicheParityTest.php`
 * les tient ensemble.
 *
 * Le super-admin lit tout. Un parent attendu et introuvable, même en corbeille, ne s'ouvre à
 * personne d'autre (verif-591 passe 2, N1). Sinon, on lit une tâche à laquelle on PREND PART
 * ({@see self::participe()}, la règle de `update`) :
 *  1. son créateur, tant que le parent est hors agence ou qu'il est encore MEMBRE de son agence
 *     (TCK-591, verif-591 M1) ;
 *  2. son assigné, tant que le parent est hors agence ou qu'il est PERSONNEL de son agence
 *     (verif-591 B1) ;
 *  3. le remplaçant de l'assigné absent, dans l'agence de l'absence (ADR-0035) ;
 * ou, en lecture seule :
 *  4. le lecteur d'équipe : qui tient `crm.view_all` dans l'agence de son profil actif lit la tâche
 *     assignée au personnel actif de cette agence, parent dans cette agence (TCK-2595).
 *
 * **Deux exceptions écrites ici, avec leur raison** (ADR-0138 § 5) :
 *  - les branches 1 à 3 lisent TOUTES les agences de l'appelant, pas la seule du profil actif : un
 *    agent de deux agences retrouve ses tâches dans les deux, et la couverture d'une absence vaut
 *    dans l'agence de l'absence quel que soit l'espace ouvert (ADR-0035) ;
 *  - la liste a deux modes : « mes tâches » ({@see self::restreindre()}, branches 1 à 3) et la vue
 *    d'équipe, `filter[team]=1` ({@see self::restreindreALEquipe()}, branche 4), qui REMPLACE la
 *    première. La fiche s'ouvre si l'une des deux liste la ligne ; le test de parité compare la fiche
 *    à leur réunion.
 *
 * Le parent supprimé en douceur se juge sur son agence (TCK-617, ADR-0138 § 4), des deux côtés.
 * TCK-3006 — la réservation est un parent comme les autres (la tâche de remboursement,
 * `BookingRefundTaskService`) : la fiche la jugeait sur l'agence de la réservation, la liste ne la
 * connaissait pas, et la tâche ouverte à son assigné n'était dans aucune de ses listes.
 */
final class TachesLisibles
{
    /** Les parents d'une tâche, tous porteurs d'une `agency_id` et supprimables en douceur. */
    private const PARENTS = [Customer::class, Property::class, Booking::class];

    /**
     * « Mes tâches » : les branches 1 à 3.
     *
     * @param  Builder<Task>  $query
     * @return Builder<Task>
     */
    public static function restreindre(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $resolver = app(MembershipCapabilityResolver::class);
        $staffAgencyIds = $resolver->staffAgencyIds($user);
        $memberAgencyIds = $resolver->memberAgencyIds($user);
        $absences = app(AgentAvailability::class)->coveredBy($user);
        $assigne = $query->qualifyColumn('assigned_to_id');

        return $query->where(function (Builder $q) use ($user, $staffAgencyIds, $memberAgencyIds, $absences, $assigne) {
            // 1.
            $q->where(fn (Builder $c) => self::parentDans($c->where($q->qualifyColumn('created_by_id'), $user->id), $memberAgencyIds))
                // 2.
                ->orWhere(fn (Builder $a) => self::parentDans($a->where($assigne, $user->id), $staffAgencyIds));
            // 3.
            foreach ($absences as $absence) {
                $q->orWhere(fn (Builder $c) => $c->where($assigne, $absence['absent_id'])
                    ->whereHasMorph('taskable', self::PARENTS, fn (Builder $parent) => $parent
                        ->withoutGlobalScope(SoftDeletingScope::class)->where('agency_id', $absence['agency_id'])));
            }
        });
    }

    /**
     * La vue d'équipe de `$agency` (branche 4) : les tâches assignées à son personnel actif, parent
     * dans l'agence. L'agence est celle que {@see TaskPolicy::teamAgencyOf()} rend à l'appelant.
     *
     * @param  Builder<Task>  $query
     * @return Builder<Task>
     */
    public static function restreindreALEquipe(Builder $query, Agency $agency): Builder
    {
        return $query->assigneAuPersonnelActifDe((int) $agency->id)->parentInAgency((int) $agency->id);
    }

    public static function peut(User $user, Task $task): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }
        if ($task->parentIsMissing()) {
            return false;
        }

        return self::participe($user, $task) || self::litEnEquipe($user, $task);
    }

    /**
     * Branches 1 à 3 : qui prend part à la tâche. C'est aussi la règle de `TaskPolicy::update`
     * (cocher, modifier), qui ne s'élargit pas à la lecture d'équipe.
     */
    public static function participe(User $user, Task $task): bool
    {
        $agencyId = $task->parentAgencyId();
        $resolver = app(MembershipCapabilityResolver::class);

        return ((int) $task->created_by_id === (int) $user->id
                && ($agencyId === null || $resolver->isMemberAt($user, $agencyId)))
            || ($task->assigned_to_id !== null && (int) $task->assigned_to_id === (int) $user->id
                && ($agencyId === null || $resolver->isStaffAt($user, $agencyId)))
            || ($task->assigned_to_id !== null && $agencyId !== null
                && app(AgentAvailability::class)->covers($user, (int) $task->assigned_to_id, $agencyId));
    }

    /** Branche 4. */
    private static function litEnEquipe(User $user, Task $task): bool
    {
        if ($task->assigned_to_id === null) {
            return false;
        }
        $agency = TaskPolicy::teamAgencyOf($user);

        return $agency !== null
            && $task->parentAgencyId() === (int) $agency->id
            && PersonnelDeLAgence::estPersonnel(User::query()->find($task->assigned_to_id), $agency->id);
    }

    /**
     * Le parent est absent (tâche personnelle), hors agence, ou dans l'une des agences — corbeille
     * comprise. Un parent effacé pour de bon n'y est pas, comme il n'ouvre pas la fiche. Public pour
     * l'agenda, qui borne à SON agence un sous-ensemble de {@see self::restreindre()}.
     *
     * @param  Builder<Task>  $query
     * @param  list<int>  $agencyIds
     * @return Builder<Task>
     */
    public static function parentDans(Builder $query, array $agencyIds): Builder
    {
        return $query->where(fn (Builder $q) => $q->whereNull($q->qualifyColumn('taskable_type'))
            ->orWhereHasMorph('taskable', self::PARENTS, fn (Builder $parent) => $parent
                ->withoutGlobalScope(SoftDeletingScope::class)
                ->where(fn (Builder $w) => $w->whereNull('agency_id')->orWhereIn('agency_id', $agencyIds))));
    }
}
