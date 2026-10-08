<?php

namespace App\Policies;

use App\Models\Guarantor;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `GuarantorController::authorizeAccess()`.
 */
class GuarantorPolicy extends BasePolicy
{
    /**
     * Lire une caution : super-admin, celui qui l'a ajoutée, ou un membre de l'agence de
     * celui-ci.
     *
     * ⚠ La troisième clause passe par `addedBy?->agency_id`, **pas** par une colonne `agency_id`
     * sur la caution : ce modèle n'en a pas. C'est une jointure implicite, et la recopier de
     * mémoire ailleurs aurait produit une règle plus permissive sans que rien ne le signale.
     *
     * TCK-587 (ADR-0031) — « un membre de l'agence » est désormais son PERSONNEL : un bailleur de
     * l'agence lisait, modifiait et supprimait les cautions ajoutées par les autres.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Guarantor) {
            return false;
        }

        return $user->isSuperAdmin()
            || $model->added_by_id === $user->id
            || ($model->addedBy !== null && $this->isStaffOf($user, $model->addedBy->agency_id));
    }

    /** `GuarantorController` employait la même règle pour lire et pour écrire. */
    public function update(User $user, Model $model): bool
    {
        return $this->view($user, $model);
    }

    /**
     * TCK-587 — supprimer : l'auteur, ou le personnel de l'agence de l'auteur — la règle de
     * `view()`, qui ne compte plus les bailleurs. `GuarantorController::destroy` autorisait par
     * `view` ; cette surcharge empêche `BasePolicy::delete()` de le fermer à tous.
     */
    public function delete(User $user, Model $model): bool
    {
        return $this->view($user, $model);
    }
}
