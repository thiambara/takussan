<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\Enums\PropertyVisibility;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-074 — authorization for custom property actions (duplicate, bulk-archive).
 *
 * ⚠ **TCK-306 — le CRUD standard n'est plus « handled inline ».** Ce docblock disait
 * « Standard CRUD remains handled inline in `PropertyController` via `authorizeAccess` /
 * `authorizeManage` », et c'était vrai de **huit** contrôleurs, pas d'un : `PropertyController`,
 * `PropertyAddressController`, `PropertyAncestorsController`, `PropertyChildrenController`,
 * `PropertyCollaboratorController`, `PropertyMediaController`, `PropertyPriceHistoryController`,
 * `PropertyTagController` — plus `InventoryController::authorizePropertyAccess()` et
 * `MaintenanceRequestController::authorizeAccessProperty()`. Dix copies de la même règle, écrites
 * sous trois formes syntaxiques différentes (`abort_unless($ok, 403)`, une cascade de `return`,
 * une délégation). Elles sont toutes ici désormais, et `scripts/check-controller-authorization.mjs`
 * casse si l'une d'elles revient.
 *
 * The `super_admin` bypass is already wired globally via Gate::before.
 */
class PropertyPolicy extends BasePolicy
{
    /**
     * TCK-306 — lire un bien : propriétaire, périmètre d'agence, ou super-admin.
     *
     * Reprise EXACTE des dix `authorizeAccess()` recensés ci-dessus, qui portaient tous ces trois
     * clauses et rien d'autre.
     *
     * ⚠ **Cette méthode ÉLARGIT `view`, et il faut le dire.** Sans elle, `BasePolicy::view()`
     * s'appliquait avec `viewCapability() === null`, c'est-à-dire **super-admin seul** — l'ability
     * `view` d'un bien refusait donc propriétaire et agence. Elle n'avait **aucun appelant**
     * (mesuré le 2026-08-17 : 0 `can('view', $property)`, 0 `authorize('view', …)` sur ce modèle),
     * si bien que ce refus n'a jamais été observé : c'était une porte murée, pas une porte fermée.
     * La rendre utilisable n'ouvre rien qui ne fût déjà ouvert par les contrôleurs.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Property) {
            return false;
        }

        if ($user->id === $model->user_id) {
            return true;
        }

        if ($this->isStaffOf($user, $model->agency_id)) {
            return true;
        }

        return $user->isSuperAdmin();
    }

    /**
     * TCK-306 — reprise de `PropertyMediaController::authorizeView()` : les médias d'un bien
     * PUBLIÉ et public sont lisibles par tout le monde ; sinon il faut les droits d'écriture.
     *
     * La distinction n'est pas cosmétique : c'est la seule règle du lot où la visibilité du
     * modèle, et non l'identité de l'appelant, décide.
     *
     * TCK-587 (vérification adverse, M1) — qui lit le bien en lit les médias. Exiger `update`
     * revenait, depuis ADR-0031, à exiger `properties.update_any` sur le bien d'un autre : l'agent
     * qui relit et publie la proposition d'un bailleur n'en voyait plus les photos. `update`
     * reste une voie d'accès pour qui modifie le bien sans le lire par `view`.
     */
    public function viewMedia(User $user, Property $property): bool
    {
        if ($property->visibility === PropertyVisibility::Public && $property->published_at !== null) {
            return true;
        }

        return $this->view($user, $property) || $this->update($user, $property);
    }

    /**
     * TCK-587 (ADR-0031) — créer un bien.
     *
     * `properties.create` dans l'agence du profil actif, OU **bailleur actif** de cette agence : il
     * ne crée pas un bien du catalogue, il le PROPOSE — `PropertyController::store` impose alors
     * `draft` + `private`, et le personnel tenant `properties.publish` le publie.
     *
     * Avant ce ticket, aucune autorisation n'atteignait cette méthode : `store` n'appelait rien et
     * `StorePropertyRequest::authorize()` rendait `true`. Tout compte authentifié, client compris,
     * créait un bien.
     */
    public function create(User $user): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        $agencyId = $user->agency_id;
        if ($agencyId === null) {
            return false;
        }

        return $user->can(Capability::PropertiesCreate->value)
            || $user->isOwnerAt((int) $agencyId);
    }

    /**
     * TCK-587 — l'appelant crée-t-il une PROPOSITION (bailleur de l'agence, sans
     * `properties.create`) plutôt qu'un bien de l'agence ? Lu par `PropertyController::store`.
     */
    public function createsProposal(User $user): bool
    {
        return ! $user->isSuperAdmin()
            && ! $user->can(Capability::PropertiesCreate->value);
    }

    /**
     * TCK-587 — modifier un bien. L'enum sépare `update_own` et `update_any` (« mes ressources vs
     * toutes les ressources », `docs/features.md` §2.2) ; ce docblock l'annonçait et la méthode ne
     * le faisait pas : auteur OU même agence, sans capacité.
     *
     *  - son propre bien (`user_id`) : `properties.update_own` dans l'agence du bien, pour qui en
     *    est membre ; un auteur sans aucun profil dans l'agence du bien (ou un bien sans agence)
     *    garde son bien, il n'a pas de rôle qui pourrait porter la capacité ;
     *  - le bien d'un autre : personnel de l'agence du bien tenant `properties.update_any`.
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Property) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        if ($user->id === $model->user_id) {
            return ! $this->isMemberOf($user, $model->agency_id)
                || $user->can(Capability::PropertiesUpdateOwn->value, $model);
        }

        return $this->isStaffOf($user, $model->agency_id)
            && $user->can(Capability::PropertiesUpdateAny->value, $model);
    }

    /**
     * TCK-587 — supprimer un bien : `properties.delete` dans l'agence du bien. `destroy`
     * réutilisait `update` : un agent supprimait le bien d'un collègue, et un bailleur celui d'un
     * autre bailleur de l'agence. Un bien sans agence reste à son auteur.
     */
    public function delete(User $user, Model $model): bool
    {
        return $this->agencyGesture($user, $model, Capability::PropertiesDelete);
    }

    /**
     * TCK-587 — publier, dépublier, rendre public, passer en `available` / `published` :
     * `properties.publish` dans l'agence du bien. `publish`/`unpublish` réutilisaient `update`, et
     * `PUT …/status` comme `PUT …/visibility` en étaient deux contournements.
     */
    public function publish(User $user, Property $property): bool
    {
        return $this->agencyGesture($user, $property, Capability::PropertiesPublish);
    }

    private function agencyGesture(User $user, Model $model, Capability $capability): bool
    {
        if (! $model instanceof Property) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        if ($model->agency_id === null) {
            return $user->id === $model->user_id;
        }

        return $this->isMemberOf($user, $model->agency_id)
            && $user->can($capability->value, $model);
    }

    /** Un profil (de tout statut) dans l'agence : c'est ce qui fait qu'un rôle juge l'auteur. */
    private function isMemberOf(User $user, mixed $agencyId): bool
    {
        if ($agencyId === null) {
            return false;
        }

        $agencyId = (int) $agencyId;

        return $user->hasProfileAt($agencyId, OwnerProfile::class)
            || $user->hasProfileAt($agencyId, AgentProfile::class)
            || $user->hasProfileAt($agencyId, AgencyAdminProfile::class);
    }

    /**
     * TCK-591 §5 — les prospects qu'un bien intéresse sont un fichier de l'AGENCE : seul son
     * personnel les voit, jamais le bailleur du bien (qui n'est pas son personnel).
     *
     * TCK-587 — prédicat « personnel de l'agence » ; `isStaffAt()` à sa fusion.
     */
    public function matchProspects(User $user, Property $property): bool
    {
        $agencyId = $property->agency_id;

        return $agencyId !== null && ($user->isAgentAt((int) $agencyId) || $user->isAgencyAdminAt((int) $agencyId));
    }

    /**
     * Duplicate requires update rights on the source property.
     */
    public function duplicate(User $user, Property $property): bool
    {
        return $this->update($user, $property);
    }

    /**
     * Bulk-archive is granted when the user is authenticated; per-property
     * authorization is delegated to the service which evaluates each id
     * through the `update` policy.
     */
    public function bulkArchive(User $user): bool
    {
        return $user !== null;
    }

    /**
     * TCK-086 — re-parenting requires update rights on the child AND on the
     * candidate parent (when one is provided). Detaching to root only needs
     * update rights on the child.
     */
    public function updateParent(User $user, Property $child, ?Property $newParent = null): bool
    {
        if (! $this->update($user, $child)) {
            return false;
        }

        if ($newParent === null) {
            return true;
        }

        return $this->update($user, $newParent);
    }
}
