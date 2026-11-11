<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Agency\AgentAvailability;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `TaskController::authorizeAccess()` et `authorizeTaskable()`.
 *
 * ⚠ `TaskController::authorizeAssignee()` n'est **pas** ici, et c'est délibéré : elle rend
 * **422**, pas 403. « L'assigné doit appartenir à votre agence » est une contrainte de forme sur
 * le corps de la requête, pas un refus d'accès — la déplacer dans une policy aurait transformé
 * son code de réponse. Elle reste dans le contrôleur.
 */
class TaskPolicy extends BasePolicy
{
    /**
     * Lire une tâche : super-admin, créateur, ou assigné — et, depuis TCK-2595, le lecteur de
     * l'équipe (`readsAsTeam`).
     *
     * TCK-591 (verif-591 B1) — l'affectation ne vaut que tant qu'on est PERSONNEL de l'agence du
     * parent (Contraintes 1 : « la quitter éteint ce qu'elle ouvrait »). Un agent retiré lisait,
     * cochait et réécrivait les tâches de l'agence qui lui restaient assignées.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Task) {
            return false;
        }
        if ($user->isSuperAdmin()) {
            return true;
        }
        // verif-591 passe 2 (N1) — un parent introuvable n'est pas un parent « hors agence ».
        if ($model->parentIsMissing()) {
            return false;
        }

        return $this->participates($user, $model) || $this->readsAsTeam($user, $model);
    }

    /**
     * Créateur, assigné ou suppléant : qui prend part à la tâche — la règle de `update` (cocher,
     * modifier), qui ne s'élargit pas à la lecture d'équipe (TCK-2595).
     */
    private function participates(User $user, Task $task): bool
    {
        return ($task->created_by_id === $user->id && $this->isMemberOfParent($user, $task))
            || ($task->assigned_to_id === $user->id && $this->isStaffOfParent($user, $task))
            || $this->coversAssignee($user, $task);
    }

    /**
     * TCK-2595 (décision de la session) — une ligne qu'on liste doit s'ouvrir : qui tient
     * `crm.view_all` dans l'agence active lit la tâche d'un collègue, exactement dans la portée de
     * `filter[team]=1` — assignée au personnel actif de cette agence, parent dans cette agence.
     * Lecture seule : `update`, `delete` et l'achèvement n'en héritent pas.
     */
    private function readsAsTeam(User $user, Task $task): bool
    {
        if ($task->assigned_to_id === null) {
            return false;
        }
        $agency = self::teamAgencyOf($user);

        return $agency !== null
            && $task->parentAgencyId() === (int) $agency->id
            && PersonnelDeLAgence::estPersonnel(User::query()->find($task->assigned_to_id), $agency->id);
    }

    /**
     * TCK-2595 — l'agence dont l'appelant lit les tâches de l'équipe : celle de son profil actif, s'il
     * y est personnel actif ET y tient `crm.view_all` ; sinon aucune. Seule définition, lue par
     * `TaskController::index` (`filter[team]=1`) et par `view`.
     */
    public static function teamAgencyOf(User $user): ?Agency
    {
        $agencyId = $user->staffAgencyId();
        if ($agencyId === null || ! PersonnelDeLAgence::personnelActifDe($user, $agencyId)) {
            return null;
        }
        $agency = Agency::query()->find($agencyId);

        return $agency !== null && $user->canActAt(Capability::CrmViewAll, $agency) ? $agency : null;
    }

    /**
     * TCK-591 (verif-591 M1, décision de la session) — le créateur garde sa tâche tant qu'il est
     * MEMBRE actif (de tout type) de l'agence du parent ; un parent hors agence garde son créateur.
     * Après passation et retrait, le partant reprenait la tâche transmise, puis la supprimait.
     */
    private function isMemberOfParent(User $user, Task $task): bool
    {
        $agencyId = $task->parentAgencyId();

        return $agencyId === null
            || app(MembershipCapabilityResolver::class)->isMemberAt($user, $agencyId);
    }

    /** Personnel de l'agence du parent ; un parent hors agence n'a que des tâches qu'on s'est confiées. */
    private function isStaffOfParent(User $user, Task $task): bool
    {
        $agencyId = $task->parentAgencyId();

        return $agencyId === null
            || app(MembershipCapabilityResolver::class)->isStaffAt($user, $agencyId);
    }

    /**
     * TCK-591 (ADR-0035) — pendant une absence active, le remplaçant lit et met à jour (coche) les
     * tâches assignées à l'absent dans l'agence de l'absence. Jamais la suppression : `delete` ne
     * passe pas par ici.
     */
    private function coversAssignee(User $user, Task $task): bool
    {
        $agencyId = $task->parentAgencyId();

        return $task->assigned_to_id !== null
            && $agencyId !== null
            && app(AgentAvailability::class)->covers($user, (int) $task->assigned_to_id, (int) $agencyId);
    }

    /** `TaskController` employait la même règle pour lire et pour écrire. */
    public function update(User $user, Model $model): bool
    {
        // TCK-2595 — `view` s'est élargie à la lecture d'équipe ; `update` garde la règle d'avant.
        if (! $model instanceof Task) {
            return false;
        }
        if ($user->isSuperAdmin()) {
            return true;
        }

        return ! $model->parentIsMissing() && $this->participates($user, $model);
    }

    /**
     * TCK-591 — supprimer une tâche est le geste de son CRÉATEUR (ou du super-admin). L'assigné
     * garde `update` — cocher, commenter — mais n'efface plus la tâche qu'on lui a confiée.
     */
    public function delete(User $user, Model $model): bool
    {
        if (! $model instanceof Task) {
            return false;
        }
        if ($user->isSuperAdmin()) {
            return true;
        }

        return ! $model->parentIsMissing()
            && $model->created_by_id === $user->id && $this->isMemberOfParent($user, $model);
    }

    /**
     * Rattacher une tâche à un bien ou à un client. TCK-2595 — le libellé du parent ne se lit plus
     * par ici : `TaskController::taskable()` le juge sous `view` du parent (lire un bien n'exige pas
     * de pouvoir le modifier).
     *
     * TCK-591 — la règle est celle du PARENT : voir le client (`CustomerPolicy::view`), modifier le
     * bien (`PropertyPolicy::update`). Elle jugeait l'agence par `$user->agency_id`, l'agence du
     * profil actif QUEL QU'IL SOIT : un bailleur rattachait une tâche à n'importe quel client de
     * l'agence — et le libellé que la réponse porte aurait énuméré les noms du CRM.
     */
    public function attachTo(User $user, Model $parent): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return match (true) {
            $parent instanceof Customer => $user->can('view', $parent),
            $parent instanceof Property => $user->can('update', $parent),
            default => false,
        };
    }
}
