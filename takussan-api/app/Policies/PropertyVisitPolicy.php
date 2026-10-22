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
        // Passe 4 (X1) — le compte doit être joignable : par `isStaffOf`, un compte BLOQUÉ de
        // l'agence lisait encore la visite et sa fiche. Passe 5 (X1′) — et l'agence est celle du
        // PROFIL ACTIF (ADR-0031 §1) : `PersonnelDeLAgence::personnelActifDe`.
        return $user->isSuperAdmin()
            || $model->visitor_id === $user->id
            || ($model->agent_id === $user->id
                && ($property === null || $property->agency_id === null
                    || PersonnelDeLAgence::personnelActifDe($user, $property->agency_id)))
            || ($property && PrimaryPropertyContact::estProprietaire($user, $property))
            || ($property && PersonnelDeLAgence::personnelActifDe($user, $property->agency_id))
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
        // Passes 4 et 5 (X1, X1′) — le personnel, comme dans `view` : `personnelActifDe`.
        return $user->isSuperAdmin()
            || $model->agent_id === $user->id
            || ($property && $this->landlordWrites($user, $property->user_id, $property->agency_id))
            || ($property && PersonnelDeLAgence::personnelActifDe($user, $property->agency_id));
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

    /**
     * P152.04 — déplacée de `PropertyVisitController` pour que `PropertyVisitResource` la lise.
     *
     * L'appelant agit-il au nom de ceux qui gèrent le bien — et peut-il donc confirmer, clore,
     * annuler ou déplacer une visite, et en prévenir le visiteur ?
     *
     *   · **bien d'agence** : le super-admin et le personnel ACTIF de l'agence du bien, rien
     *     d'autre. Le bailleur n'est pas « l'agence » de la contrainte 4 ;
     *   · **bien sans agence** : le super-admin, l'agent de la visite s'il est joignable, et le
     *     propriétaire (cf. `PrimaryPropertyContact::estProprietaire`).
     *
     * Vérification adverse (M3, puis passe 2 : M7 et écart b) — un bailleur de l'agence annulait
     * ou déplaçait la visite du bien d'un AUTRE bailleur, l'agent parti créateur du bien celle de
     * « son » bien, et chaque déplacement partait en SMS au visiteur (le relais B2′). Depuis la
     * fusion de TCK-587, `PropertyVisitPolicy::update` refuse le bailleur tiers ; elle garde le
     * propriétaire d'un bien d'agence (`landlordWrites`), que cette règle refuse ici (écart b,
     * décision de la session). Les deux gardes se recouvrent pour le bailleur tiers : l'ablation
     * de l'une seule laisse le test vert, celle des deux le rougit.
     */
    public static function agitPourLeBien(User $user, PropertyVisit $visit): bool
    {
        $property = $visit->property;

        if ($user->isSuperAdmin()) {
            return true;
        }
        if ($property === null) {
            return $visit->agent_id === $user->id;
        }
        if ($property->agency_id !== null) {
            return PersonnelDeLAgence::personnelActifDe($user, $property->agency_id);
        }

        return ($visit->agent_id === $user->id && PrimaryPropertyContact::joignable($user))
            || PrimaryPropertyContact::estProprietaire($user, $property);
    }
}
