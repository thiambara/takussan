<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\BailleurDuBien;
use Illuminate\Database\Eloquent\Model;

/**
 * Base CRUD policy.
 *
 * Une policy concrète DÉSIGNE ses capacités, elle ne les NOMME plus.
 *
 * ⚠ TCK-297 — cette classe construisait ses abilities par concaténation :
 * `$user->can($this->resource().'.view')`. Trois familles de chaînes ainsi
 * produites ne correspondaient à **aucun** cas de `Capability` :
 *
 *   - `properties.view`  — l'enum n'a AUCUN cas `.view`, sur aucun domaine ;
 *   - `leases.view|update|delete` — idem, et `properties.update` n'existe pas
 *     non plus : l'enum sépare `update_any` et `update_own` (« mes ressources
 *     vs toutes les ressources », features.md §2.2) ;
 *   - `media.*` — `media` n'est même pas un préfixe de l'enum.
 *
 * Or **une ability non définie ne lève pas, elle refuse**. Ces abilities
 * refusaient donc tout le monde sauf le super-admin, silencieusement, et
 * aucun test ne rougissait puisque aucun site d'appel ne les atteignait.
 *
 * C'est le MÊME défaut que TCK-278 avait corrigé dans `MediaPolicy::viewRaw`
 * (`can('properties.update')`, cf. son docblock). Ce correctif-là traitait le
 * symptôme ; celui-ci traite le générateur. Le typage `?Capability` rend
 * désormais la faute **inexprimable** : on ne peut plus écrire une capacité
 * qui n'existe pas, là où aucun type, aucun lint et aucun test ne pouvait
 * l'attraper.
 *
 * **La lecture n'est pas gardée par capacité, et c'est délibéré.** `Capability`
 * catalogue des verbes privilégiés (`crm.view_all`, `reports.view_global`) ;
 * le droit de LIRE une ressource ordinaire est porté par le périmètre
 * d'agence et la propriété — principe non négociable n°2. Une ability sans
 * capacité déclarée refuse donc, et c'est exactement ce que faisait déjà le
 * code : ce ticket rend l'intention lisible, il ne rouvre aucun accès.
 *
 * Le bypass `super_admin` est câblé globalement par `Gate::before`
 * (`AppServiceProvider`). Il s'applique via `$user->can()` ci-dessous, donc y
 * compris quand la policy est instanciée directement.
 */
abstract class BasePolicy
{
    /**
     * Capacité exigée pour `viewAny` et `view`.
     *
     * `null` par défaut : lire n'est pas un privilège catalogué (cf. docblock
     * de classe). Une policy qui doit gater la lecture surcharge et rend un
     * cas de `Capability` — `CrmViewAll` ou `ReportsViewGlobal`, par exemple.
     */
    protected function viewCapability(): ?Capability
    {
        return null;
    }

    protected function createCapability(): ?Capability
    {
        return null;
    }

    protected function updateCapability(): ?Capability
    {
        return null;
    }

    protected function deleteCapability(): ?Capability
    {
        return null;
    }

    public function viewAny(User $user): bool
    {
        return $this->allows($user, $this->viewCapability());
    }

    public function view(User $user, Model $model): bool
    {
        return $this->allows($user, $this->viewCapability(), $model);
    }

    public function create(User $user): bool
    {
        return $this->allows($user, $this->createCapability());
    }

    public function update(User $user, Model $model): bool
    {
        return $this->allows($user, $this->updateCapability(), $model);
    }

    public function delete(User $user, Model $model): bool
    {
        return $this->allows($user, $this->deleteCapability(), $model);
    }

    /**
     * TCK-587 (ADR-0031 §1) — l'appelant est-il PERSONNEL de cette agence (agent ou admin actif, ou
     * délégation active de ces rôles, dans l'agence de son profil actif) ?
     *
     * C'est la seule forme du « périmètre d'agence » qu'une policy écrit. Elle remplace
     * `$user->agency_id === $model->agency_id`, qui était vraie pour un BAILLEUR de l'agence :
     * chacun lisait et modifiait les baux, loyers et versements de tous les autres.
     */
    protected function isStaffOf(User $user, mixed $agencyId): bool
    {
        if ($agencyId === null) {
            return false;
        }

        $staffAgencyId = $user->staffAgencyId();

        return $staffAgencyId !== null && $staffAgencyId === (int) $agencyId;
    }

    /**
     * TCK-587 (ADR-0031 §2, vérification adverse m3) — le bailleur ÉCRIT sur ce qui le désigne
     * (`landlord_id`), sauf s'il est suspendu (`blocked`) dans l'agence de la ressource : il en garde
     * la lecture (il reste partie au contrat), il en perd les gestes — encaisser, modifier, renouveler,
     * résilier, réviser.
     *
     * Vérification adverse passe 2 (N2) — la règle vaut pour tout ce que le bailleur écrit en son
     * nom propre dans l'agence, pas pour le seul bail : état des lieux, visite, document (modifier,
     * supprimer, partager). `$authorId` est la colonne qui le désigne (`landlord_id`, `user_id` du
     * bien, `conducted_by`, `uploaded_by`). Un profil de PERSONNEL actif dans la même agence écrit
     * toujours : c'est en tant que personnel qu'il agit, pas en tant que bailleur.
     */
    protected function landlordWrites(User $user, mixed $authorId, mixed $agencyId): bool
    {
        if ($authorId === null || (int) $authorId !== $user->id) {
            return false;
        }

        return $agencyId === null
            || ! $user->isBlockedOwnerAt((int) $agencyId)
            || $this->isStaffOf($user, $agencyId);
    }

    /**
     * P218.03 (TCK-2196) — ADR-0031, amendement du 2026-10-24 : la branche d'AUTEUR d'une ligne
     * (`issued_by_id`, `created_by_id`, `conducted_by`…) ne vaut que si la ligne est sans agence,
     * ou si l'auteur est encore membre de son agence (`isMemberAt` : personnel actif ou bailleur
     * actif). Précédent : `CustomerPolicy::isAuthorStillMember`. L'agent suspendu ou retiré, et le
     * bailleur bloqué, n'y entrent plus par leur seule signature. Forme SQL des listes :
     * `MembershipCapabilityResolver::memberAgencyIds`.
     *
     * P233.04 (TCK-2290) — publique et statique : une policy qui n'hérite pas de cette classe
     * (`AgencyUpgradeRequestPolicy`, dont les abilities prennent une agence) lit la même règle.
     */
    public static function auteurEncoreMembre(User $user, mixed $authorId, mixed $agencyId): bool
    {
        if ($authorId === null || (int) $authorId !== $user->id) {
            return false;
        }

        return $agencyId === null
            || app(MembershipCapabilityResolver::class)->isMemberAt($user, (int) $agencyId);
    }

    /**
     * TCK-1722 (P160.03) — `landlordWrites` pour une colonne qui désigne le BAILLEUR d'un bien ou
     * d'un bail (`properties.user_id`, `leases.landlord_id`) : l'utilisateur désigné n'en est le
     * bailleur que s'il y est propriétaire ({@see BailleurDuBien}). L'agent qui a saisi le bien, que
     * `LeaseService::create` recopie en `landlord_id`, agit au titre du personnel, sous ses capacités.
     *
     * `landlordWrites` reste tel quel pour les colonnes d'AUTEUR (`conducted_by`, `uploaded_by`).
     */
    protected function bailleurEcrit(User $user, mixed $landlordId, mixed $agencyId): bool
    {
        return BailleurDuBien::est($user, $landlordId, $agencyId)
            && $this->landlordWrites($user, $landlordId, $agencyId);
    }

    /**
     * Le modèle est passé en contexte pour que la Gate dérivée de l'enum
     * (`AppServiceProvider`) en tire l'agence — sans quoi elle retomberait sur
     * le profil actif, ce qui est juste en HTTP mais faux en job et en console.
     */
    private function allows(User $user, ?Capability $capability, ?Model $model = null): bool
    {
        if ($capability === null) {
            return $user->isSuperAdmin();
        }

        return $user->can($capability->value, $model);
    }
}
