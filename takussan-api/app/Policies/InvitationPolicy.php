<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;

/**
 * TCK-249 — authorisation rules for the invitation surface.
 *
 * The `super_admin` bypass is wired globally via `Gate::before`, so
 * super-admin actors short-circuit every method below.
 *
 * For everyone else, capability is derived from the role of the actor's
 * active profile:
 *  - holders of `team.invite` in the agency, admin included, and the
 *    agency's primary admin: can list, read, resend and revoke within their
 *    own agency (TCK-1748).
 *  - everyone else: read-only on invitations they themselves emitted, no
 *    revoke / list scope — EXCEPT the issuer of an invitation born from a
 *    customer fiche, who resends and revokes it while they can still invite
 *    that customer (TCK-2668, D1 : {@see self::emetteurDeLInvitationDuClient()}).
 *
 * There is no `create` here (P208.01, TCK-2190): the generic creation route is
 * gone, and each per-role route judges its own gesture
 * ({@see OwnerProfilePolicy}, {@see AgentProfilePolicy},
 * {@see Profiles\ServiceProviderProfilePolicy}), as does the super-admin cooptation.
 */
class InvitationPolicy
{
    /**
     * TCK-1748 (P116.03) — UNE règle pour les cinq gestes et la portée de la liste : `team.invite`
     * dans l'agence, admin compris, comme {@see AgencyPolicy::updateKyc()} ; l'admin principal garde
     * le geste sans la capacité. La liste, la lecture et la création jugeaient le type de profil
     * admin, la révocation la capacité : un admin sans `team.invite` créait et révoquait, un agent
     * qui la tient révoquait une invitation qu'il ne pouvait pas lister.
     */
    public function invitesAt(User $user, ?int $agencyId, ?Agency $loaded = null): bool
    {
        if ($agencyId === null) {
            return false;
        }

        // TCK-2739 — l'agence déjà chargée par l'appelant (la relation de l'invitation) : un repli qui
        // juge N membres ne la relit pas N fois. Seulement si elle porte ce que le jugement lit
        // (`primary_admin_id` ici, `status` pour le verrou de suspension du résolveur) et n'est pas
        // supprimée : une relation chargée en champs restreints (`fields[agencies]`) jugerait autrement
        // que `find()`.
        $agency = $loaded !== null
            && (int) $loaded->getKey() === $agencyId
            && array_key_exists('primary_admin_id', $loaded->getAttributes())
            && array_key_exists('status', $loaded->getAttributes())
            && ! $loaded->trashed()
            ? $loaded
            : Agency::query()->find($agencyId);

        return $agency !== null
            && ($agency->primary_admin_id === $user->id || $user->canActAt(Capability::TeamInvite, $agency));
    }

    public function viewAny(User $user): bool
    {
        // Listing requires either super_admin (handled by Gate::before)
        // or `team.invite` in the active agency. The controller further
        // narrows the result set by `agency_id` for non-super actors.
        return $this->invitesAt($user, $user->staffAgencyId());
    }

    public function view(User $user, Invitation $invitation): bool
    {
        if ($this->invitesAt($user, $user->staffAgencyId())) {
            // TCK-587 — un admin actif est personnel : le prédicat unique (ADR-0031 §1).
            return $invitation->agency_id === null
                || $invitation->agency_id === $user->staffAgencyId();
        }

        // Non-admin actors can only see invitations they emitted (so the
        // per-role wizard can show "your pending invites" in the UI).
        //
        // P218.05 (TCK-2194) — and only while still a member of the
        // invitation's agency, as `revoke` and `resend` since TCK-429: the
        // suspended or removed emitter read the invitee's address.
        return $invitation->invited_by === $user->id
            && ($invitation->agency_id === null
                || app(MembershipCapabilityResolver::class)->isMemberAt($user, (int) $invitation->agency_id));
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
     * `invited_by` ne survit donc, seul, que pour les invitations SANS agence
     * (cooptation super-admin, assistants hors agence) : là, il n'y a aucune
     * frontière à faire respecter, et l'émetteur est le seul rattachement
     * qui existe. Dans une agence, il ne vaut que pour l'invitation née d'une
     * fiche client, et JAMAIS seul : l'émetteur doit pouvoir encore inviter ce
     * client, ce qui rejuge la frontière d'agence aujourd'hui (TCK-2668, D1).
     *
     * ## Deux prédicats, parce que le front en garde un troisième
     *
     * La console Équipe cache ses deux boutons sur `useCan('team.invite')`.
     * Tant que le serveur ne jugeait QUE sur `isAgencyAdminAt()`, un agent à
     * qui l'agence avait délégué `team.invite` sur un rôle personnalisé
     * (TCK-279) voyait les deux boutons et prenait 403 sur les deux. La
     * capacité est donc acceptée ICI aussi : les deux gardes disent enfin la
     * même chose. Depuis TCK-1748, la capacité est la règle, admin
     * compris ({@see self::invitesAt()}) : le test `isAgencyAdminAt()` qui
     * passait en tête laissait révoquer un admin dont le rôle la retire. Seule
     * exception : l'émetteur d'une invitation de client (TCK-2668, D1).
     */
    public function revoke(User $user, Invitation $invitation): bool
    {
        $agencyId = $invitation->agency_id;

        if ($agencyId === null) {
            return $invitation->invited_by === $user->id;
        }

        return $this->invitesAt($user, (int) $agencyId, $invitation->relationLoaded('agency') ? $invitation->agency : null)
            || $this->emetteurDeLInvitationDuClient($user, $invitation);
    }

    /**
     * Vérification de TCK-2668 (D1, décision de la session du 2026-11-12) — l'agent qui a invité SON
     * client à créer son compte relance et annule cette invitation, sans `team.invite`.
     *
     * La fiche client offrait « Relancer » et « Annuler » à l'agent qui avait invité, et l'API les
     * lui refusait (403) : `CustomerPolicy::invite()` ne demande que la lecture de la fiche et d'être
     * du personnel, mais la relance et la révocation exigeaient `team.invite` dès que l'invitation a
     * une agence. Comme « Inviter à créer son compte » cède sa place à « Relancer » tant qu'une
     * invitation est sans réponse, l'agent n'avait plus aucun geste qui marche.
     *
     * La règle est celle de la création, rejouée aujourd'hui : l'émetteur, pour une invitation née
     * d'une fiche client de la même agence, s'il peut ENCORE inviter ce client
     * ({@see CustomerPolicy::invite()} : lire la fiche, être du personnel de son agence). L'émetteur
     * parti, suspendu ou qui ne lit plus la fiche n'a plus rien. Les invitations d'équipe (agent,
     * administrateur, bailleur, prestataire) restent sous `team.invite`.
     */
    private function emetteurDeLInvitationDuClient(User $user, Invitation $invitation): bool
    {
        if ($invitation->invited_by !== $user->id
            || $invitation->invitable_type !== (new Customer)->getMorphClass()
            || $invitation->invitable_id === null) {
            return false;
        }

        $customer = Customer::query()->find($invitation->invitable_id);

        return $customer !== null
            && (int) $customer->agency_id === (int) $invitation->agency_id
            && $user->can('invite', $customer);
    }

    public function resend(User $user, Invitation $invitation): bool
    {
        return $this->revoke($user, $invitation);
    }

    /**
     * TCK-2665 — supprimer les invitations expirées de l'agence : qui invite dans cette agence, la
     * règle de {@see self::revoke()} (`team.invite`, ou l'admin principal).
     */
    public function purgeExpired(User $user, Agency $agency): bool
    {
        return $this->invitesAt($user, (int) $agency->getKey());
    }
}
