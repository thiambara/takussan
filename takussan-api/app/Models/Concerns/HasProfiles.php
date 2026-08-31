<?php

namespace App\Models\Concerns;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\BrokerProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\RoleDelegation;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Identity-side profiles trait. Lives on User.
 *
 * Décrit QUI est un utilisateur dans chaque contexte d'agence. Ce qu'il PEUT y
 * faire est répondu séparément par `Capability` + `MembershipCapabilityResolver`
 * (ADR-0003), atteignables depuis ici par `canActAt()`.
 *
 * Ce docblock se présentait auparavant comme le « trait jumeau de HasRoles
 * (spatie) ». `spatie/laravel-permission` a été DÉSINSTALLÉ par TCK-278
 * (ADR-0002) et une garde CI casse sur tout import de son namespace : il n'y a
 * plus de jumeau. Un commentaire survit au code qu'il décrit, et il y survit
 * avec la même autorité qu'un commentaire juste.
 */
trait HasProfiles
{
    public function ownerProfiles(): HasMany
    {
        return $this->hasMany(OwnerProfile::class);
    }

    public function agentProfiles(): HasMany
    {
        return $this->hasMany(AgentProfile::class);
    }

    /**
     * TCK-271 — agency-admin profiles held by this user. Multi-row because
     * a future flow could attach the same user as admin to several
     * agencies (cooptation, multi-tenant operator). The wizard creates
     * exactly one row today.
     */
    public function agencyAdminProfiles(): HasMany
    {
        return $this->hasMany(AgencyAdminProfile::class);
    }

    public function brokerProfile(): HasOne
    {
        return $this->hasOne(BrokerProfile::class);
    }

    public function serviceProviderProfile(): HasOne
    {
        return $this->hasOne(ServiceProviderProfile::class);
    }

    /**
     * TCK-278 — profil plateforme (cross-tenant). Contrainte unique sur
     * `user_id` au niveau schéma : un user a au plus un PlatformProfile.
     */
    public function platformProfile(): HasOne
    {
        return $this->hasOne(PlatformProfile::class);
    }

    /**
     * Unified collection of every profile this user holds, across all five
     * concrete profile classes. Not a real Eloquent relation — eager load
     * via `$user->load(['ownerProfiles', 'agentProfiles', 'agencyAdminProfiles',
     * 'brokerProfile', 'serviceProviderProfile'])` upstream if needed.
     */
    public function profiles(): Collection
    {
        $owners = $this->relationLoaded('ownerProfiles')
            ? $this->ownerProfiles
            : $this->ownerProfiles()->get();
        $agents = $this->relationLoaded('agentProfiles')
            ? $this->agentProfiles
            : $this->agentProfiles()->get();
        $admins = $this->relationLoaded('agencyAdminProfiles')
            ? $this->agencyAdminProfiles
            : $this->agencyAdminProfiles()->get();
        $broker = $this->relationLoaded('brokerProfile')
            ? $this->brokerProfile
            : $this->brokerProfile()->first();
        $sp = $this->relationLoaded('serviceProviderProfile')
            ? $this->serviceProviderProfile
            : $this->serviceProviderProfile()->first();

        // `concat()` (vs `merge()`) is required: an Eloquent Collection
        // keyed by primary key would otherwise drop sibling profiles that
        // share an id across different concrete classes.
        $collection = new Collection;
        $collection = $collection->concat($owners)->concat($agents)->concat($admins);
        if ($broker) {
            $collection->push($broker);
        }
        if ($sp) {
            $collection->push($sp);
        }

        return $collection;
    }

    /**
     * Whether the user holds a profile of the given concrete class. When
     * `$agencyId` is given, restrict the check to that agency for profile
     * classes that are agency-scoped (Owner, Agent). Broker/ServiceProvider
     * are user-scoped and ignore `$agencyId`.
     */
    public function hasProfile(string $class, ?int $agencyId = null): bool
    {
        return match ($class) {
            OwnerProfile::class => $agencyId === null
                ? $this->ownerProfiles()->exists()
                : $this->ownerProfiles()->where('agency_id', $agencyId)->exists(),
            AgentProfile::class => $agencyId === null
                ? $this->agentProfiles()->exists()
                : $this->agentProfiles()->where('agency_id', $agencyId)->exists(),
            AgencyAdminProfile::class => $agencyId === null
                ? $this->agencyAdminProfiles()->exists()
                : $this->agencyAdminProfiles()->where('agency_id', $agencyId)->exists(),
            BrokerProfile::class => $this->brokerProfile()->exists(),
            ServiceProviderProfile::class => $this->serviceProviderProfile()->exists(),
            default => false,
        };
    }

    public function isOwnerAt(int $agencyId): bool
    {
        return $this->ownerProfiles()
            ->where('agency_id', $agencyId)
            ->whereNull('deleted_at')
            ->exists();
    }

    public function isAgentAt(int $agencyId): bool
    {
        return $this->agentProfiles()
            ->where('agency_id', $agencyId)
            ->whereNull('deleted_at')
            ->exists();
    }

    public function isAgencyAdminAt(int $agencyId): bool
    {
        return $this->agencyAdminProfiles()
            ->where('agency_id', $agencyId)
            ->whereNull('deleted_at')
            ->exists();
    }

    public function isProviderAt(int $agencyId): bool
    {
        return $this->serviceProviderProfile()
            ->whereHas('agencyCollaborations', fn ($q) => $q->where('agency_id', $agencyId))
            ->exists();
    }

    public function isProfessional(): bool
    {
        return $this->agentProfiles()->exists()
            || $this->brokerProfile()->exists()
            || $this->serviceProviderProfile()->exists();
    }

    /**
     * TCK-278 — Liste des "rôles" du user. Remplace l'ancien `getRoleNames()`
     * de spatie.
     *
     * **Deux natures, et la distinction porte du sens.** Les six premières
     * valeurs — `super_admin`, `agency_admin`, `agent`, `owner`, `broker`,
     * `service_provider` — sont dérivées des profils POLYMORPHES (Règle 5) :
     * une ligne existe en base, elle est commutable, elle entre dans
     * `ActiveProfileResolver::TYPE_MAP`. Les deux dernières — `customer` et
     * `tenant` — sont dérivées d'un ÉTAT : elles n'ont ni table, ni ligne, ni
     * entrée dans la carte des profils, et ne se choisissent pas dans le
     * sélecteur.
     *
     * ⚠ **TCK-492 — `customer` et `tenant` ont manqué ici pendant trois mois et
     * demi, et c'est le front qui l'a payé.** TCK-278 (2026-05-17) a remplacé
     * les rôles spatie par cette méthode en renvoyant explicitement la
     * profile-isation de `customer`/`tenant` à un « ticket séparé si besoin
     * émerge » — ticket jamais créé. `isCustomer()` et `isTenant()` rendaient
     * donc `false` en toutes circonstances, et QUATRE surfaces front en
     * dépendaient : « Mes réservations / visites / baux » du menu latéral, le
     * widget de check-list locataire (TCK-266) et l'onboarding customer
     * (TCK-253, un P0 livré sept jours AVANT le cutover). Aucune n'a rougi :
     * une condition qui ne s'allume jamais n'échoue pas, elle se tait.
     *
     * `models-spec.md` les qualifiait déjà de « dérivés » et `features.md#22`
     * les listait en P0 : c'est le code qui avait divergé de la spec.
     *
     * **Coût mesuré** (AC6) : `customer` est gratuit — c'est le plancher, aucune
     * requête. `tenant` ajoute UN `exists()` (une jointure `customers ⋈ leases`,
     * les deux colonnes portant un index), soit 7 requêtes de profil au lieu
     * de 6 sur le chemin de `/api/auth/me`.
     *
     * @return Collection<int,string>
     */
    public function profileTypes(): Collection
    {
        $types = new Collection;
        if ($this->hasActiveSuperAdminProfile()) {
            $types->push('super_admin');
        }
        if ($this->agencyAdminProfiles()->exists()) {
            $types->push('agency_admin');
        }
        if ($this->agentProfiles()->exists()) {
            $types->push('agent');
        }
        if ($this->ownerProfiles()->exists()) {
            $types->push('owner');
        }
        if ($this->brokerProfile()->exists()) {
            $types->push('broker');
        }
        if ($this->serviceProviderProfile()->exists()) {
            $types->push('service_provider');
        }

        // TCK-492 — les deux rôles DÉRIVÉS, poussés après les profils pour que
        // la liste se lise dans cet ordre : ce qu'on EST, puis ce qu'on FAIT.
        //
        // `customer` est le plancher : toute identité authentifiée en est une,
        // y compris celle qui porte par ailleurs un profil d'agence — le modèle
        // est ADDITIF (principe non négociable n° 2), pas exclusif. Un
        // administrateur d'agence qui loue un appartement est les deux.
        $types->push('customer');

        if ($this->hasActiveTenantLease()) {
            $types->push('tenant');
        }

        return $types->values();
    }

    /**
     * TCK-492 — vrai si l'utilisateur occupe au moins un bail en cours.
     *
     * **`tenant` n'est pas un état permanent** : il se déduit du bail et
     * disparaît avec lui. C'est la raison pour laquelle il ne devient pas un
     * profil polymorphe — une ligne de profil survivrait au bail, et il
     * faudrait alors la retirer, c'est-à-dire réimplémenter cette dérivation
     * en pire.
     *
     * ⚠ `Terminating` compte comme un bail en cours, et ce n'est pas une
     * tolérance : le docblock de {@see LeaseStatus::Terminating} dit que le
     * loyer reste dû pendant le préavis. Quelqu'un qui a posé son congé habite
     * toujours son logement — lui retirer « Mes baux » du menu le jour de la
     * demande lui retirerait précisément l'écran où son préavis se suit.
     */
    public function hasActiveTenantLease(): bool
    {
        // ⚠ `leases.status` QUALIFIÉ, jamais `status` nu : `tenantLeases()` est
        // un `hasManyThrough` qui joint `customers`, et cette table porte elle
        // aussi une colonne `status`. PostgreSQL REFUSE l'ambiguïté au lieu de
        // l'arbitrer en silence comme le faisaient MySQL et SQLite (piège n° 7
        // de CLAUDE.md) — ici la requête aurait filtré sur le statut du dossier
        // client, ou n'aurait pas tourné du tout.
        return $this->tenantLeases()
            ->whereIn('leases.status', [LeaseStatus::Active->value, LeaseStatus::Terminating->value])
            ->exists();
    }

    /**
     * TCK-278 — Vrai si l'utilisateur détient un profil polymorphe du
     * type donné, optionnellement scopé à une agence. `$profileType` est
     * le FQN du modèle (`OwnerProfile::class`, etc.) ; alias court de
     * `hasProfile()` qui complète l'API publique avec une signature
     * explicite `(agencyId, type)` côté Policies/Services.
     */
    public function hasProfileAt(int $agencyId, string $profileType): bool
    {
        return $this->hasProfile($profileType, $agencyId);
    }

    /**
     * TCK-278 — Vrai si l'utilisateur dispose d'un PlatformProfile
     * `super_admin` actif. **Source de vérité unique** : le cutover P3 est
     * fait, il n'y a plus de cohabitation avec un check spatie historique.
     * `User::isSuperAdmin()` délègue désormais ici.
     */
    public function hasActiveSuperAdminProfile(): bool
    {
        $profile = $this->relationLoaded('platformProfile')
            ? $this->platformProfile
            : $this->platformProfile()->active()->first();

        return $profile !== null
            && $profile->isActive()
            && $profile->level === PlatformProfileLevel::SuperAdmin;
    }

    /**
     * TCK-278 — Vérifie une capacité atomique pour cet utilisateur dans le
     * contexte (`Agency` ou plateforme si null). Délègue au
     * `MembershipCapabilityResolver` ; site d'appel stable pour P2/P3.
     */
    public function canActAt(Capability $capability, ?Agency $agency = null): bool
    {
        return app(MembershipCapabilityResolver::class)->allows($this, $capability, $agency);
    }

    /**
     * TCK-395 (revue) — comme {@see self::canActAt()}, mais **sans consulter
     * les délégations** : ne rend vrai que si l'utilisateur tient la capacité
     * de ses propres profils.
     *
     * À n'employer que pour un geste dont la délégation serait absurde ou
     * inerte — aujourd'hui `team.delegate_role` et lui seul. Partout ailleurs,
     * `canActAt()` est le bon site d'appel : une délégation est faite pour
     * conférer.
     */
    public function canActDirectlyAt(Capability $capability, ?Agency $agency = null): bool
    {
        return app(MembershipCapabilityResolver::class)->allowsDirectly($this, $capability, $agency);
    }

    /**
     * Vrai si l'utilisateur dispose d'une `RoleDelegation` active pour le rôle
     * indiqué dans l'agence donnée.
     *
     * TCK-456 — la fenêtre n'est plus réécrite ici : elle est empruntée à
     * {@see RoleDelegation::scopeActive()}, devenue la source
     * unique. La clause qui vivait ici était identique à celle du résolveur et
     * divergeait de ce scope ; les trois sont désormais liées par
     * `RoleDelegationActivityWindowTest`.
     *
     * @deprecated TCK-395 — **pour autoriser.** C'est un PRÉDICAT D'ÉTAT sur la
     * table `role_delegations`, pas un contrôle d'autorisation, et la nuance
     * lui a coûté cher : elle teste une CHAÎNE (`'agency_admin'`) sans regarder
     * ce que le rôle délégué porte réellement, ni ce que le délégant détient.
     * Les six sites d'appel qui s'en servaient pour autoriser accordaient donc
     * l'agency_admin PLEIN à qui n'aurait rien dû recevoir.
     *
     * Pour autoriser, employer `canActAt()` — qui consulte les délégations via
     * {@see MembershipCapabilityResolver::delegationAllows()} et les borne par
     * le pivot `agency_role_capabilities` et par le délégant.
     *
     * **Conservée, et non supprimée, pour une raison précise** : elle reste le
     * seul moyen d'asserter l'ÉTAT d'une délégation sans passer par la
     * résolution de capacités, ce que font dix assertions de tests — et
     * notamment celles qui doivent distinguer « la ligne est active » de « le
     * privilège est ouvert », deux choses que TCK-395 vient justement de
     * séparer. Aucun appelant de production ne subsiste dans `app/`.
     */
    public function hasActiveAgencyDelegation(int $agencyId, string $role): bool
    {
        return $this->roleDelegations()
            ->where('agency_id', $agencyId)
            ->where('role', $role)
            ->active()
            ->exists();
    }

    /**
     * Active profile for the current request — set by `ResolveActiveProfile`
     * middleware. Reads through `request()->activeProfile()` so the truth
     * lives in one place. Returns null outside the request scope, when no
     * profile was resolved, or when the current request actor is a *different*
     * user than `$this` (the active profile is per-request, not a property
     * of arbitrary User instances).
     */
    public function activeProfile()
    {
        if (! app()->bound('request')) {
            return null;
        }

        $profile = request()->activeProfile();
        if ($profile === null) {
            return null;
        }

        return ((int) $profile->user_id === (int) $this->id) ? $profile : null;
    }
}
