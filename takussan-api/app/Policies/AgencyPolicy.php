<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\User;
use App\Providers\AppServiceProvider;

/**
 * TCK-290 — « Qui administre cette agence ». UNE définition, ici.
 *
 * L'expression était écrite deux fois dans `AgencyController` (`update()` et
 * `authorizeAdmin()`) et nulle part ailleurs — `Gate::getPolicyFor(Agency)`
 * rendait `null`. `MediaController::authorizeAttach` retombait donc sur sa
 * branche « propriétaire seulement », qu'une `Agency` ne peut pas satisfaire
 * (pas de colonne `user_id`, mais `primary_admin_id`) : l'upload du logo
 * rendait 403 pour TOUT LE MONDE, super-admin compris — cette branche ne
 * consulte jamais la Gate, donc n'atteint pas le bypass `Gate::before`
 * enregistré dans {@see AppServiceProvider}.
 *
 * ⚠ N'étend délibérément PAS `BasePolicy` : ses abilities sont
 * `{resource}.view|create|update|delete`, or `agencies.update` n'est aucun cas
 * de `Capability` (l'enum ne connaît que `agency.update`, au singulier).
 *
 * ⚠ N'est délibérément PAS écrite avec `canActAt(Capability::AgencyUpdate, …)`,
 * malgré les apparences de « la bonne façon TCK-278 » :
 * `MembershipCapabilityResolver` n'exige pas que le profil ACTIF soit sur
 * l'agence visée et ignore `primary_admin_id`. La remplacer par la capacité
 * autoriserait un admin de Y agissant sous son profil X à modifier Y (contrat
 * strict TCK-146), et retirerait l'accès au compte fondateur qui n'a pas de
 * profil matérialisé. Les deux dérives sont pinnées dans
 * `tests/Feature/Media/AgencyLogoUploadTest.php`.
 */
class AgencyPolicy
{
    /**
     * Règle partagée avec `AgencyController::update()` et
     * `AgencyController::authorizeAdmin()`, qui délèguent tous deux ici.
     *
     * Le super-admin passe par `Gate::before` — inutile de le retester.
     * `$user->activeProfile()` est l'équivalent policy de
     * `request()->activeProfile()` : même source, filtrée sur l'appartenance
     * du profil, et `null` hors contexte HTTP.
     */
    public function update(User $user, Agency $agency): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        if ($agency->primary_admin_id === $user->id) {
            return true;
        }

        return $user->activeProfile()?->agency_id === $agency->id
            && $user->isAgencyAdminAt((int) $agency->id);
    }
}
