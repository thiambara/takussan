<?php

namespace App\Policies;

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
     * TCK-306 — reprise de `TaskController::authorizeTaskable()` : rattacher une tâche à un bien
     * ou à un client.
     *
     * Les colonnes de propriété diffèrent selon le modèle — `Property` par `user_id`, `Customer`
     * par `added_by_id` — d'où la lecture des deux via `getAttribute()`, une colonne absente
     * valant `null` et étant simplement ignorée. Le commentaire d'origine le disait déjà ; il est
     * conservé parce que c'est la seule chose qui rend cette méthode lisible.
     */
    public function attachTo(User $user, Model $parent): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        $agencyId = $user->agency_id;

        return ($agencyId && (int) ($parent->getAttribute('agency_id') ?? 0) === (int) $agencyId)
            || $parent->getAttribute('added_by_id') === $user->id
            || $parent->getAttribute('user_id') === $user->id;
    }
}
