<?php

namespace App\Policies;

use App\Http\Resources\PropertyVisitResource;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `PropertyVisitController::authorizeAccess()` / `authorizeManage()`.
 *
 * TCK-587 (ADR-0031) — le « périmètre d'agence » est le PERSONNEL de l'agence du bien : la clause
 * comparait `$user->agency_id`, vraie pour un autre bailleur de l'agence.
 */
class PropertyVisitPolicy extends BasePolicy
{
    /**
     * Lire une visite : super-admin, VISITEUR, agent, propriétaire du bien, périmètre d'agence,
     * ou le CLIENT rattaché.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof PropertyVisit) {
            return false;
        }

        $property = $model->property;

        // TCK-590 (passe 3, M7′) — `property.user_id` ne fait le propriétaire d'un bien d'agence
        // que s'il y est bailleur actif (`estProprietaire`, définition de M7) : l'agent parti qui
        // a créé le bien ne lit plus la visite. L'agent assigné, de même, ne la lit sur un bien
        // d'agence que tant qu'il en est du personnel. La fiche client reste au seul personnel
        // ({@see PropertyVisitResource}).
        //
        // Passe 4 (X1) — le personnel est jugé par LA définition du ticket,
        // `PersonnelDeLAgence::estPersonnel` (compte joignable, puis `isStaffAt`) : par
        // `isStaffOf`, un compte BLOQUÉ de l'agence lisait encore la visite et sa fiche.
        return $user->isSuperAdmin()
            || $model->visitor_id === $user->id
            || ($model->agent_id === $user->id
                && ($property === null || $property->agency_id === null
                    || PersonnelDeLAgence::estPersonnel($user, $property->agency_id)))
            || ($property && PrimaryPropertyContact::estProprietaire($user, $property))
            || ($property && PersonnelDeLAgence::estPersonnel($user, $property->agency_id))
            || ($model->customer && $model->customer->user_id === $user->id);
    }

    /**
     * Administrer une visite : les mêmes, **sans le visiteur ni le client**. Un visiteur annule
     * sa visite par l'endpoint dédié, qui passe par `view`.
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof PropertyVisit) {
            return false;
        }

        $property = $model->property;

        // TCK-587 (ADR-0031 §2, passe 2 N2) — le propriétaire suspendu dans l'agence du bien ne
        // déplace ni n'annule plus la visite. TCK-590 (passe 3) : sur un bien d'AGENCE, aucun
        // bailleur, actif ou bloqué, n'écrit plus une visite — `update`, `confirm`, `complete` et
        // `cancel` passent par `PropertyVisitController::agitPourLeBien`, réservé au personnel.
        // La branche `landlordWrites` ne décide donc plus que pour un bien sans agence.
        // Passe 4 (X1) — le personnel, comme dans `view` : `estPersonnel`.
        return $user->isSuperAdmin()
            || $model->agent_id === $user->id
            || ($property && $this->landlordWrites($user, $property->user_id, $property->agency_id))
            || ($property && PersonnelDeLAgence::estPersonnel($user, $property->agency_id));
    }

    /**
     * TCK-590 — proposer un autre créneau : le VISITEUR seul, par son compte ou par la fiche
     * client liée. Le gestionnaire déplace l'heure par `update`.
     */
    public function reschedule(User $user, Model $model): bool
    {
        if (! $model instanceof PropertyVisit) {
            return false;
        }

        return $model->visitor_id === $user->id
            || ($model->customer && $model->customer->user_id === $user->id);
    }
}
