<?php

namespace App\Policies;

use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE des cinq helpers de `MaintenanceRequestController` et de
 * `MaintenanceQuoteController` : `authorizeAccess`, `authorizeManage` (défini deux fois, à
 * l'identique, dans les deux contrôleurs), `authorizeAgentOrOwner` et `authorizeProvider`.
 */
class MaintenanceRequestPolicy extends BasePolicy
{
    /**
     * Lire une demande : super-admin, DEMANDEUR, prestataire assigné, propriétaire du bien, ou
     * périmètre d'agence.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof MaintenanceRequest) {
            return false;
        }

        $property = $model->property;

        return $user->isSuperAdmin()
            || $model->requester_id === $user->id
            || $model->assigned_to === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);
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

        $property = $model->property;

        return $user->isSuperAdmin()
            || $model->assigned_to === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);
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
        return self::isPrincipalFor($user, $request->property);
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
     * (`users.agency_id` n'existe plus en base depuis TCK-142) — le `&&` en tête n'est donc pas
     * une précaution contre `null`, c'est le refus d'un utilisateur sans agence active.
     */
    public static function isPrincipalFor(User $user, ?Property $property): bool
    {
        return $user->isSuperAdmin()
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);
    }

    /**
     * TCK-306 — reprise de `MaintenanceQuoteController::authorizeProvider()` : le prestataire
     * ASSIGNÉ, et lui seul, soumet un devis. Ni le propriétaire ni l'agence.
     */
    public function actAsProvider(User $user, MaintenanceRequest $request): bool
    {
        return $user->isSuperAdmin() || $request->assigned_to === $user->id;
    }
}
