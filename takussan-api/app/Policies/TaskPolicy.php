<?php

namespace App\Policies;

use App\Models\Customer;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
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
     * Lire une tâche : super-admin, créateur, ou assigné. **Pas de clause d'agence** — une tâche
     * est personnelle, et c'est la seule règle du lot qui ne regarde pas l'agence.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Task) {
            return false;
        }

        return $user->isSuperAdmin()
            || $model->created_by_id === $user->id
            || $model->assigned_to_id === $user->id;
    }

    /** `TaskController` employait la même règle pour lire et pour écrire. */
    public function update(User $user, Model $model): bool
    {
        return $this->view($user, $model);
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

        return $user->isSuperAdmin() || $model->created_by_id === $user->id;
    }

    /**
     * Rattacher une tâche à un bien ou à un client — et, par `TaskController::taskable()`, en lire
     * le libellé.
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
