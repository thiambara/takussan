<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
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

    /**
     * TCK-594 (ADR-0039 §4) — le seuil des quatre yeux se règle par qui administre l'agence ET
     * détient `payouts.approve` à cette agence : celui qui approuve décide quand on approuve. Le
     * remettre à `null` est le même geste — désactiver le contrôle n'est pas moins sensible.
     */
    public function updatePayoutThreshold(User $user, Agency $agency): bool
    {
        return $this->update($user, $agency)
            && $user->canActAt(Capability::PayoutsApprove, $agency);
    }

    /**
     * TCK-594 (ADR-0039 §7) — ce que la plateforme reverse à l'agence se lit avec
     * `agency.update_billing` À CETTE AGENCE : le relevé de facturation n'est ni au bailleur ni à
     * l'agent. L'admin d'une agence `individual` (l'hôte) la détient comme celui d'une `standard`.
     */
    public function viewPlatformPayouts(User $user, Agency $agency): bool
    {
        return $user->canActAt(Capability::AgencyUpdateBilling, $agency);
    }

    /**
     * TCK-595 (ADR-0049 §4) — les chiffres CONSOLIDÉS de l'agence (tableau de bord d'agence,
     * statistiques, performance d'équipe, balance âgée, vue agent `scope=agency`) : `reports.view_agency`
     * à cette agence, sous un profil actif de cette agence (contrat TCK-146, comme `update`).
     *
     * Ni `isAgentAt` (un agent lisait le chiffre d'affaires, les impayés et les commissions de toute
     * l'agence par appel direct), ni `primary_admin_id` seul (l'admin principal porte la capacité par
     * son rôle), ni `reports.view_global`, réservée à la plateforme et qu'aucun rôle d'agence ne
     * peut porter. Le super-admin passe par `Gate::before`.
     */
    public function viewReports(User $user, Agency $agency): bool
    {
        return $user->activeProfile()?->agency_id === $agency->id
            && $user->canActAt(Capability::ReportsViewAgency, $agency);
    }

    /**
     * TCK-591 §8 — retirer un membre de l'équipe : la capacité `team.remove` DANS l'agence de la
     * route, sous le profil actif de cette agence (contrat strict TCK-146, cf. le docblock de la
     * classe), plus le court-circuit de l'administrateur principal, qui ne peut pas s'enfermer
     * dehors par l'édition d'un rôle. Elle remplace `update` : un admin dont le rôle retire
     * `team.remove` ne retire plus, un agent dont le rôle l'accorde retire.
     */
    public function removeMember(User $user, Agency $agency): bool
    {
        if ($user->isSuperAdmin() || $agency->primary_admin_id === $user->id) {
            return true;
        }

        return $user->activeProfile()?->agency_id === $agency->id
            && $user->canActAt(Capability::TeamRemove, $agency);
    }
}
