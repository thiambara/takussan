<?php

namespace App\Policies;

use App\Models\Guarantor;
use App\Models\User;
use App\Services\Lecture\CautionsLisibles;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `GuarantorController::authorizeAccess()`.
 */
class GuarantorPolicy extends BasePolicy
{
    /**
     * Lire une caution : la règle de {@see CautionsLisibles}, que la liste applique aussi (TCK-3006,
     * ADR-0138). Elle sert aussi `update` et `delete` : l'auteur parti de l'agence de la caution ne
     * la modifie ni ne la supprime plus.
     *
     * TCK-1993 (P175.01) — l'agence d'une caution ne dépend plus de la vie de son auteur ; TCK-587
     * (ADR-0031) — « un membre de l'agence » est son PERSONNEL, plus un bailleur.
     */
    public function view(User $user, Model $model): bool
    {
        return $model instanceof Guarantor && CautionsLisibles::peut($user, $model);
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
     * L'agence d'une caution : sa colonne `agency_id`, posée à la création et rattrapée par
     * migration (TCK-1993) ; à défaut, celle de son auteur par l'accesseur pont (`null` pour un
     * auteur présent dans plusieurs agences). C'est aussi l'agence à laquelle se rattache la
     * consultation journalisée (ADR-0044 § 3, étape 1).
     */
    public static function agencyOf(Guarantor $guarantor): ?int
    {
        $agencyId = $guarantor->agency_id ?? $guarantor->addedBy?->agency_id;

        return $agencyId !== null ? (int) $agencyId : null;
    }
}
