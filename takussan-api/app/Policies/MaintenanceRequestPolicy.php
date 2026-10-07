<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Services\Maintenance\ProviderEligibility;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE des cinq helpers de `MaintenanceRequestController` et de
 * `MaintenanceQuoteController` : `authorizeAccess`, `authorizeManage` (défini deux fois, à
 * l'identique, dans les deux contrôleurs), `authorizeAgentOrOwner` et `authorizeProvider`.
 */
class MaintenanceRequestPolicy extends BasePolicy
{
    /**
     * Lire une demande : super-admin, DEMANDEUR, prestataire assigné (collaboration et profil
     * actifs), ou donneur d'ordre (bailleur du bien, personnel de l'agence du bien).
     *
     * TCK-592 — le périmètre d'agence lisait `$user->agency_id === $property->agency_id` sans
     * regarder le type de profil : un bailleur invité porte un `OwnerProfile` de l'agence, et lisait
     * donc les interventions des AUTRES bailleurs (O1). Et `assigned_to === $user->id` suffisait :
     * une collaboration finie ne retirait rien.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof MaintenanceRequest) {
            return false;
        }

        return $user->isSuperAdmin()
            || $model->requester_id === $user->id
            || $this->isAssignedProvider($user, $model)
            || self::isPrincipalFor($user, $model->property);
    }

    /**
     * Administrer une demande : les mêmes, **sans le demandeur**. Un locataire qui signale une
     * panne ne décide pas de sa résolution.
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof MaintenanceRequest) {
            return false;
        }

        return $user->isSuperAdmin()
            || $this->isAssignedProvider($user, $model)
            || self::isPrincipalFor($user, $model->property);
    }

    /**
     * TCK-592 — accepter ou refuser l'intervention : le prestataire assigné, et lui seul.
     */
    public function respondToAssignment(User $user, MaintenanceRequest $request): bool
    {
        return $this->isAssignedProvider($user, $request);
    }

    /**
     * TCK-592 (P10) — confirmer ou contester la réparation, sur une demande `completed` : le
     * DEMANDEUR ou un donneur d'ordre (contrat de données). Jamais le prestataire — il ne clôt pas
     * seul, et ne relance pas lui-même ce qu'il a déclaré fini. La matrice (acteur, cible) porte
     * déjà les trois verdicts ; l'équipe clôt sous `maintenance.close`.
     */
    public function respondToResolution(User $user, MaintenanceRequest $request, MaintenanceStatus $target): bool
    {
        if ($request->status !== MaintenanceStatus::Completed) {
            return false;
        }

        $isRequester = $request->requester_id !== null && $request->requester_id === $user->id;

        return ($isRequester || self::isPrincipalFor($user, $request->property))
            && $this->transitionTo($user, $request, $target);
    }

    /**
     * TCK-306 — reprise de `MaintenanceQuoteController::authorizeAgentOrOwner()` : côté
     * DONNEUR D'ORDRE seulement. Ni le demandeur, ni le prestataire assigné — c'est ce côté-là
     * qui accepte ou refuse un devis.
     */
    public function manageQuotes(User $user, MaintenanceRequest $request): bool
    {
        return self::isPrincipalFor($user, $request->property);
    }

    /**
     * TCK-445 — les champs du DONNEUR D'ORDRE : `assigned_to` et `priority`.
     *
     * `update()` accorde à qui fait AVANCER l'intervention, prestataire assigné compris ; cette
     * ability-ci accorde à qui la COMMANDE. Sans elle, un prestataire assigné pouvait se
     * réassigner sa propre demande et en changer la priorité : `update` ouvrait la porte,
     * `rules()` acceptait les deux champs, ils étaient `$fillable`, et le contrôleur faisait un
     * `fill()->save()` sans restriction. *Une chaîne d'autorisation ne se vérifie pas en lisant
     * la policy — elle se vérifie jusqu'au `save()`.*
     */
    public function actAsPrincipal(User $user, MaintenanceRequest $request): bool
    {
        $property = $request->property;
        if (! self::isPrincipalFor($user, $property)) {
            return false;
        }

        // TCK-592 — la branche ÉQUIPE exige `maintenance.assign` : un rôle personnalisé qui la retire
        // retire le geste. Le bailleur du bien commande sur SON bien sans capacité d'agence.
        return ! self::isTeamPrincipalFor($user, $property)
            || $user->canActAt(Capability::MaintenanceAssign, $property->agency);
    }

    /**
     * TCK-592 — changer le statut se juge par (acteur, cible), jamais par `update` seul.
     *
     * Ne dit pas si la transition EXISTE (la table de {@see MaintenanceStateMachine} rend 422) : dit
     * si cet utilisateur, dans les rôles qu'il tient sur CETTE demande, a le droit de la demander.
     * La clôture par l'équipe exige `maintenance.close`.
     */
    public function transitionTo(User $user, MaintenanceRequest $request, MaintenanceStatus $target): bool
    {
        $machine = app(MaintenanceStateMachine::class);
        $from = $request->status ?? MaintenanceStatus::Open;

        foreach ($this->actorsOf($user, $request) as $actor) {
            if (! $machine->actorAllows($actor, $from, $target)) {
                continue;
            }

            if ($actor === MaintenanceStateMachine::ACTOR_PRINCIPAL
                && $target === MaintenanceStatus::Closed
                && self::isTeamPrincipalFor($user, $request->property)
                && ! $user->canActAt(Capability::MaintenanceClose, $request->property->agency)) {
                continue;
            }

            return true;
        }

        return false;
    }

    /**
     * TCK-592 — les rôles que l'utilisateur tient sur CETTE demande. Jamais exclusifs.
     *
     * @return list<string>
     */
    public function actorsOf(User $user, MaintenanceRequest $request): array
    {
        $actors = [];
        if ($this->isAssignedProvider($user, $request)) {
            $actors[] = MaintenanceStateMachine::ACTOR_PROVIDER;
        }
        if (self::isPrincipalFor($user, $request->property)) {
            $actors[] = MaintenanceStateMachine::ACTOR_PRINCIPAL;
        }
        if ($request->requester_id === $user->id) {
            $actors[] = MaintenanceStateMachine::ACTOR_REQUESTER;
        }

        return $actors;
    }

    /**
     * TCK-592 — donneur d'ordre AU TITRE DE L'ÉQUIPE d'agence : ni super-admin, ni bailleur du bien.
     * C'est la seule branche que les capacités `maintenance.*` gardent.
     */
    public static function isTeamPrincipalFor(User $user, ?Property $property): bool
    {
        return $property !== null
            && ! $user->isSuperAdmin()
            && $property->user_id !== $user->id
            && self::isPrincipalFor($user, $property);
    }

    /**
     * TCK-445 — LA définition du côté donneur d'ordre, et la seule.
     *
     * `MaintenanceRequestController::store()` en portait une copie littérale sous le nom
     * `$isStaff`, et `update()` n'en portait aucune : c'est cette asymétrie entre deux chemins du
     * même contrôleur sur le même champ qui a signé l'oubli. Les deux chemins lisent désormais
     * cette méthode — une divergence ne peut plus se produire sans être écrite ici.
     *
     * ⚠ Principe non négociable n°2 : la capacité se juge pour un couple *(utilisateur, agence)*.
     * `$user->agency_id` est l'accesseur de compatibilité qui dérive l'agence du profil ACTIF
     * — la colonne du même nom sur la table des utilisateurs n'existe plus en base depuis
     * TCK-142. Le `&&` en tête n'est donc pas une précaution contre `null`, c'est le refus
     * d'un utilisateur sans agence active.
     *
     * ⚠ Cette phrase évite délibérément d'écrire la colonne disparue sous sa forme
     * `table.colonne` : `NoLegacyUserTypeTest` scanne le TEXTE de `app/` et ne distingue pas
     * un commentaire d'un appel. La reformuler « plus clairement » avec le littéral fait
     * rougir la garde — ce qui est le comportement voulu, un scan de texte ne pouvant pas
     * juger de l'intention.
     */
    public static function isPrincipalFor(User $user, ?Property $property): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        if ($property === null) {
            return false;
        }

        if ($property->user_id === $user->id) {
            return true;
        }

        // TCK-592 — un bailleur n'est donneur d'ordre que de SES biens (ligne ci-dessus) ; l'équipe,
        // de ceux de son agence. TCK-587 : le prédicat « personnel de l'agence » remplacera
        // `isAgentAt || isAgencyAdminAt` à la fusion.
        return $user->agency_id !== null
            && (int) $property->agency_id === (int) $user->agency_id
            && ($user->isAgentAt((int) $user->agency_id) || $user->isAgencyAdminAt((int) $user->agency_id));
    }

    /**
     * TCK-306 — reprise de `MaintenanceQuoteController::authorizeProvider()` : le prestataire
     * ASSIGNÉ, et lui seul, soumet un devis. Ni le propriétaire ni l'agence.
     */
    public function actAsProvider(User $user, MaintenanceRequest $request): bool
    {
        return $user->isSuperAdmin() || $this->isAssignedProvider($user, $request);
    }

    /**
     * TCK-592 — le prestataire ASSIGNÉ, tant qu'il est assignable au bien : profil actif et
     * collaboration active avec l'agence du bien (ou membre de son équipe). Une collaboration finie
     * ou un profil suspendu retirent l'accès, historique compris.
     */
    private function isAssignedProvider(User $user, MaintenanceRequest $request): bool
    {
        return $request->assigned_to !== null
            && $request->assigned_to === $user->id
            && app(ProviderEligibility::class)->isAssignable($user, $request->property);
    }
}
