<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Lecture\TachesLisibles;
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
     * Lire une tâche : la règle de {@see TachesLisibles}, que la liste applique aussi (TCK-3006,
     * ADR-0138) — créateur encore membre, assigné encore personnel de l'agence du parent (TCK-591,
     * verif-591 B1), remplaçant d'un absent (ADR-0035), lecteur d'équipe (TCK-2595).
     */
    public function view(User $user, Model $model): bool
    {
        return $model instanceof Task && TachesLisibles::peut($user, $model);
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

        return ! $model->parentIsMissing() && TachesLisibles::participe($user, $model);
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

        // TCK-591 (verif-591 M1) — le créateur tant qu'il est MEMBRE de l'agence du parent : pour lui,
        // c'est ce que `participe` juge (personnel et remplaçant sont membres).
        return ! $model->parentIsMissing()
            && $model->created_by_id === $user->id && TachesLisibles::participe($user, $model);
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
