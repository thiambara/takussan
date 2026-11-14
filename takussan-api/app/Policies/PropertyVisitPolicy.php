<?php

namespace App\Policies;

use App\Http\Resources\PropertyVisitResource;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Membership\MembershipCapabilityResolver;
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
     * TCK-2578 (ADR-0101 § 2) — écrire et lire le compte rendu d'une visite : le super-admin et le
     * PERSONNEL ACTIF de l'agence du bien — la règle de `StorePropertyVisitRequest::managesProperty`.
     * Ni le visiteur, ni le client, ni le bailleur hors personnel, ni l'agent parti ; un bien sans
     * agence n'a pas de CRM d'agence, donc pas de compte rendu.
     */
    public function report(User $user, Model $model): bool
    {
        if (! $model instanceof PropertyVisit) {
            return false;
        }

        return $user->isSuperAdmin()
            || PersonnelDeLAgence::personnelActifDe($user, $model->property?->agency_id);
    }

    /**
     * TCK-2716 (décision du porteur du 2026-11-11, option a) — « Créer sa fiche » depuis une visite :
     * le SEUL prédicat, lu par `CustomerController::store` (`property_visit_id`) et par
     * `PropertyVisitResource` (`abilities.create_customer`). La règle est celle de l'AGENCE DU BIEN,
     * jamais du profil actif seul : le personnel actif de cette agence, dont la fiche naît dans cette
     * même agence (`staffAgencyId()`), sur une visite sans fiche. Le bailleur d'un bien d'agence, le
     * visiteur, le client, le compte à double casquette (personnel de B pour un bien de A) et le
     * super-admin hors agence en sont exclus. Volontairement HORS de la Gate : `Gate::before` ouvrirait
     * tout au super-admin, dont la fiche n'aurait pas d'agence.
     *
     * @return array{0: int, 1: string}|null le refus (statut, code), `null` quand la fiche peut naître
     */
    public static function refusDeLaFicheDepuisLaVisite(User $user, PropertyVisit $visit): ?array
    {
        $agencyId = $visit->property?->agency_id;
        // Personnel actif de l'agence du bien, quel que soit l'espace ouvert : sinon, 403. Personnel
        // de cette agence mais sous l'espace d'une autre, la fiche naîtrait ailleurs : 422.
        if ($agencyId === null || ! PrimaryPropertyContact::joignable($user)
            || ! app(MembershipCapabilityResolver::class)->isStaffAt($user, (int) $agencyId)) {
            return [403, 'visit.staff_only'];
        }
        if ($user->staffAgencyId() !== (int) $agencyId) {
            return [422, 'visit.agency_mismatch'];
        }
        if ($visit->customer_id !== null) {
            return [422, 'visit.customer_already_linked'];
        }

        return null;
    }

    /**
     * P152.04 — GÉRER la visite : confirmer, clore, déclarer manquée, déplacer ou annuler au nom de
     * ceux qui gèrent le bien, c'est `update` ET {@see agitPourLeBien()}, comme le contrôleur.
     * TCK-2589 — la règle d'`abilities.manage` du show de visite ET de `upcoming_visits[].manage` de
     * la fiche client : une seule méthode, pour que les deux ne divergent pas.
     */
    public static function gere(User $user, PropertyVisit $visit): bool
    {
        return $user->can('update', $visit) && self::agitPourLeBien($user, $visit);
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
