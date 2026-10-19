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

    /**
     * TCK-955 (ADR-0070 § 5) — la pièce et le revenu EN CLAIR : un profil d'admin dans l'agence que
     * `view()` lit déjà ({@see self::agencyOf()}). Une caution dont l'auteur n'a pas d'agence
     * résolue n'a pas d'admin pour lecteur. Le super-admin passe par `Gate::before` (amendement
     * d'ADR-0070 du 2026-10-19).
     */
    public function viewSensitive(User $user, Guarantor $guarantor): bool
    {
        $agencyId = self::agencyOf($guarantor);

        return $agencyId !== null && $user->isAgencyAdminAt($agencyId);
    }

    /**
     * L'agence d'une caution, qui n'a pas de colonne `agency_id` : celle de son auteur, par
     * l'accesseur pont (`null` pour un auteur présent dans plusieurs agences). C'est aussi
     * l'agence à laquelle se rattache la consultation journalisée (ADR-0044 § 3, étape 1).
     */
    public static function agencyOf(Guarantor $guarantor): ?int
    {
        $agencyId = $guarantor->addedBy?->agency_id;

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
