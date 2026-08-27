<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\Invitation;
use App\Models\User;

/**
 * TCK-249 — authorisation rules for the invitation surface.
 *
 * The `super_admin` bypass is wired globally via `Gate::before`, so
 * super-admin actors short-circuit every method below.
 *
 * For everyone else, capability is derived from the role of the actor's
 * active profile:
 *  - agency_admin / admin: can invite + revoke + list within their own
 *    agency.
 *  - owner / agent: cannot create invitations themselves (owners may invite
 *    in TCK-256 but only via the per-role wizard which calls the service
 *    directly, not via this generic endpoint).
 *  - everyone else: read-only on invitations they themselves emitted, no
 *    create / revoke / list scope.
 */
class InvitationPolicy
{
    public function viewAny(User $user): bool
    {
        // Listing requires either super_admin (handled by Gate::before)
        // or an agency-side role. The controller further narrows the
        // result set by `agency_id` for non-super actors.
        return $user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id);
    }

    public function view(User $user, Invitation $invitation): bool
    {
        if ($user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id)) {
            return $invitation->agency_id === null
                || $invitation->agency_id === $user->agency_id;
        }

        // Non-admin actors can only see invitations they emitted (so the
        // per-role wizard can show "your pending invites" in the UI).
        return $invitation->invited_by === $user->id;
    }

    public function create(User $user): bool
    {
        // Generic endpoint: only agency-side admin roles can call it.
        // Per-role wizards (TCK-256/258/260) bypass this policy by
        // talking to InvitationService directly with their own,
        // role-aware authorisation.
        return $user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id);
    }

    /**
     * TCK-368 — l'autorisation se juge dans L'AGENCE DE L'INVITATION.
     *
     * ## `invited_by` ne franchit pas la frontière d'agence
     *
     * Cette méthode rendait `true` sur `invited_by === $user->id` AVANT tout
     * contrôle d'agence. Mesuré (TCK-429, ex-défaut de revue) : un
     * `agency_admin` dont l'`AgencyAdminProfile` avait été supprimé de
     * l'agence obtenait encore **200** sur `resend` ET sur `revoke` — un
     * ex-membre pouvait donc continuer à réémettre un lien d'accès vers une
     * agence qu'il a quittée. *L'agence est la frontière d'isolation*
     * (CLAUDE.md, principe n°2), et une colonne d'historique n'est pas une
     * autorisation.
     *
     * `invited_by` ne survit donc que pour les invitations SANS agence
     * (cooptation super-admin, assistants hors agence) : là, il n'y a aucune
     * frontière à faire respecter, et l'émetteur est le seul rattachement
     * qui existe.
     *
     * ## Deux prédicats, parce que le front en garde un troisième
     *
     * La console Équipe cache ses deux boutons sur `useCan('team.invite')`.
     * Tant que le serveur ne jugeait QUE sur `isAgencyAdminAt()`, un agent à
     * qui l'agence avait délégué `team.invite` sur un rôle personnalisé
     * (TCK-279) voyait les deux boutons et prenait 403 sur les deux. La
     * capacité est donc acceptée ICI aussi : les deux gardes disent enfin la
     * même chose. Le test `isAgencyAdminAt()` reste en tête parce qu'il
     * coûte une requête là où la résolution de capacité en coûte plusieurs,
     * et qu'il couvre le cas de très loin le plus fréquent.
     */
    public function revoke(User $user, Invitation $invitation): bool
    {
        $agencyId = $invitation->agency_id;

        if ($agencyId === null) {
            return $invitation->invited_by === $user->id;
        }

        if ($user->isAgencyAdminAt((int) $agencyId)) {
            return true;
        }

        $agency = $invitation->agency;

        return $agency !== null && $user->canActAt(Capability::TeamInvite, $agency);
    }

    public function resend(User $user, Invitation $invitation): bool
    {
        return $this->revoke($user, $invitation);
    }
}
