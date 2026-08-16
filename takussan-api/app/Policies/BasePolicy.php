<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\User;
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
