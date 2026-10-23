<?php

namespace App\Models\Concerns;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PlatformAbility;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\RoleDelegation;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
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
    /**
     * TCK-492 — les statuts d'un bail EN COURS pour le rôle dérivé `tenant` (voir
     * {@see self::hasActiveTenantLease()}). Constante pour que le préchargement de
     * `tenantLeases` (TCK-653, liste des membres) filtre exactement comme la requête.
     */
    public const ACTIVE_TENANT_LEASE_STATUSES = Lease::ONGOING_STATUSES;

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
     * Les profils COMMUTABLES de cet utilisateur — ceux que
     * `ActiveProfileResolver::TYPE_MAP` sait nommer. Ce n'est pas une relation
     * Eloquent : précharger via `$user->load(['ownerProfiles', 'agentProfiles',
     * 'agencyAdminProfiles', 'serviceProviderProfile'])` en amont si besoin.
     *
     * TCK-495 a retiré le courtier de cette liste (ADR-0027), et ADR-0030 l'a
     * retiré du code et de la base : les profils polymorphes sont cinq.
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
        $sp = $this->relationLoaded('serviceProviderProfile')
            ? $this->serviceProviderProfile
            : $this->serviceProviderProfile()->first();

        // `concat()` (vs `merge()`) is required: an Eloquent Collection
        // keyed by primary key would otherwise drop sibling profiles that
        // share an id across different concrete classes.
        $collection = new Collection;
        $collection = $collection->concat($owners)->concat($agents)->concat($admins);
        if ($sp) {
            $collection->push($sp);
        }

        return $collection;
    }

    /**
     * Whether the user holds a profile of the given concrete class. When
     * `$agencyId` is given, restrict the check to that agency for profile
     * classes that are agency-scoped (Owner, Agent, AgencyAdmin).
     * ServiceProvider is user-scoped and ignores `$agencyId`.
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
            ServiceProviderProfile::class => $this->serviceProviderProfile()->exists(),
            default => false,
        };
    }

    /**
     * TCK-587 (ADR-0031 §3) — `isOwnerAt`, `isAgentAt` et `isAgencyAdminAt` jugent un DROIT : ils ne
     * comptent que les profils ACTIFS. Ils ne filtraient que `deleted_at` (redondant : les trois
     * modèles sont `SoftDeletes`), si bien qu'un co-admin suspendu suspendait encore les autres
     * (`AgentInvitationService::suspend`). Un site qui teste une APPARTENANCE — doublon
     * d'invitation, réactivation, liste d'équipe — emploie {@see self::hasProfileAt()}, sans filtre
     * de statut.
     */
    public function isOwnerAt(int $agencyId): bool
    {
        return $this->ownerProfiles()
            ->where('agency_id', $agencyId)
            ->active()
            ->exists();
    }

    /**
     * TCK-587 (ADR-0031 §2, vérification adverse m3) — bailleur SUSPENDU dans cette agence
     * (`blocked`, par `POST /api/agencies/{a}/team/{u}/suspend`). Il reste partie à ses baux et en
     * garde la lecture ; il en perd les écritures dans cette agence.
     */
    public function isBlockedOwnerAt(int $agencyId): bool
    {
        // TCK-1867 (P189.01) — jugé une fois pour la page dans une liste amorcée.
        if (($amorce = MembershipCapabilityResolver::amorce('blocked_owner', (int) $this->id, $agencyId)) !== null) {
            return $amorce;
        }

        return $this->ownerProfiles()
            ->where('agency_id', $agencyId)
            ->where('status', OwnerProfileStatus::Blocked->value)
            ->exists();
    }

    public function isAgentAt(int $agencyId): bool
    {
        return $this->agentProfiles()
            ->where('agency_id', $agencyId)
            ->active()
            ->exists();
    }

    public function isAgencyAdminAt(int $agencyId): bool
    {
        return $this->agencyAdminProfiles()
            ->where('agency_id', $agencyId)
            ->active()
            ->exists();
    }

    /**
     * TCK-592 (B13) — une collaboration `paused` ou `ended` ne fait plus un prestataire de l'agence.
     */
    public function isProviderAt(int $agencyId): bool
    {
        return $this->serviceProviderProfile()
            ->whereHas('agencyCollaborations', fn ($q) => $q
                ->where('agency_id', $agencyId)
                ->where('status', CollaborationStatus::Active->value))
            ->exists();
    }

    public function isProfessional(): bool
    {
        return $this->agentProfiles()->exists()
            || $this->serviceProviderProfile()->exists();
    }

    /**
     * TCK-278 — Liste des "rôles" du user. Remplace l'ancien `getRoleNames()`
     * de spatie.
     *
     * **Deux natures, et la distinction porte du sens.** Les cinq premières
     * valeurs — `super_admin`, `agency_admin`, `agent`, `owner`,
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
     * sur `leases_tenant_id_index` et `customers_user_id_index` — ce dernier
     * posé seulement par TCK-862 : jusque-là, la jointure relisait toute la
     * table `customers`), soit 7 requêtes de profil au lieu
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
        // TCK-653 — chaque test relit la relation quand elle est préchargée, comme
        // `profiles()` : sans quoi une liste de N utilisateurs émet 5N `exists()`.
        if ($this->profileRelationExists('agencyAdminProfiles')) {
            $types->push('agency_admin');
        }
        if ($this->profileRelationExists('agentProfiles')) {
            $types->push('agent');
        }
        if ($this->profileRelationExists('ownerProfiles')) {
            $types->push('owner');
        }
        // Le courtier n'est plus un profil (ADR-0030) : `roles` ne nomme que
        // ce à quoi `buildNavItems` côté front associe une entrée de menu.
        if ($this->profileRelationExists('serviceProviderProfile')) {
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
     * TCK-2002 (P176.02, P176.03 ; ADR-0005, amendement du 2026-10-23) — la variante « actifs
     * seulement » de {@see self::profileTypes()}, bornée à UNE agence : les types des profils
     * d'agence ACTIFS tenus dans `$agencyId`, puis les types globaux (`super_admin`,
     * `service_provider` actif, `customer`, `tenant`), dans l'ordre de `profileTypes()`.
     *
     * `$agencyId` nul = aucune agence en jeu : seuls les types globaux sortent. C'est le `roles` de
     * `/api/auth/me` (`UserResource`), lu avec l'agence du profil actif. Un profil suspendu,
     * archivé, inactif ou bloqué ne confère aucun rôle (ADR-0031 § 3), même règle que
     * `getAgencyIdAttribute()` : {@see ActiveProfileResolver::isActiveProfile()}.
     *
     * @return Collection<int,string>
     */
    public function activeProfileTypesAt(?int $agencyId): Collection
    {
        return $this->typesRetenus(fn ($profile): bool => $agencyId !== null
            && (int) $profile->agency_id === $agencyId
            && ActiveProfileResolver::isActiveProfile($profile));
    }

    /**
     * TCK-2004 (P176.04 ; ADR-0005, amendement du 2026-10-23, point 4) — les types tenus dans
     * l'agence de la route d'une liste de membres, QUEL QUE SOIT leur statut : la liste d'équipe
     * teste une appartenance (ADR-0031 § 3), et l'admin doit voir le membre suspendu pour le
     * réactiver. Le statut sort à côté, par {@see self::profileStatusesAt()}. Les types globaux
     * suivent la règle de {@see self::activeProfileTypesAt()}.
     *
     * @return Collection<int,string>
     */
    public function memberProfileTypesAt(int $agencyId): Collection
    {
        return $this->typesRetenus(fn ($profile): bool => (int) $profile->agency_id === $agencyId);
    }

    /**
     * TCK-2004 — le statut de chaque profil d'agence tenu dans `$agencyId`, par type
     * (`['agent' => 'suspended']`).
     *
     * @return array<string,string>
     */
    public function profileStatusesAt(int $agencyId): array
    {
        $statuts = [];
        foreach (self::AGENCY_PROFILE_RELATIONS as $relation => $type) {
            $profile = $this->profileRows($relation)->first(fn ($p): bool => (int) $p->agency_id === $agencyId);
            if ($profile !== null) {
                $status = $profile->getAttribute('status');
                $statuts[$type] = $status instanceof \BackedEnum ? (string) $status->value : (string) $status;
            }
        }

        return $statuts;
    }

    /**
     * TCK-2006 (P176.05 ; ADR-0005, amendement du 2026-10-23, point 2) — la variante « actifs
     * seulement », toutes agences : le critère `roles` du ciblage des annonces et des drapeaux.
     *
     * @return Collection<int,string>
     */
    public function activeProfileTypes(): Collection
    {
        return $this->typesRetenus(fn ($profile): bool => ActiveProfileResolver::isActiveProfile($profile));
    }

    /**
     * TCK-2006 (P176.05 ; ADR-0005, amendement du 2026-10-23, point 2) — les agences où le compte
     * tient un profil ACTIF, toutes : le critère `agency_ids` du ciblage, qui ne dépend plus du profil
     * actif de la requête.
     *
     * @return list<int>
     */
    public function activeAgencyIds(): array
    {
        $ids = [];
        foreach (array_keys(self::AGENCY_PROFILE_RELATIONS) as $relation) {
            foreach ($this->profileRows($relation) as $profile) {
                if (ActiveProfileResolver::isActiveProfile($profile)) {
                    $ids[] = (int) $profile->agency_id;
                }
            }
        }

        return array_values(array_unique($ids));
    }

    /** Les relations de profil d'agence, dans l'ordre de `profileTypes()`, et leur type. */
    private const AGENCY_PROFILE_RELATIONS = [
        'agencyAdminProfiles' => 'agency_admin',
        'agentProfiles' => 'agent',
        'ownerProfiles' => 'owner',
    ];

    /**
     * Le calcul commun des variantes de `profileTypes()` : un type d'agence sort si l'une de ses
     * lignes passe `$retenu` ; les types globaux suivent la règle des profils actifs.
     *
     * @param  callable(Model): bool  $retenu
     * @return Collection<int,string>
     */
    private function typesRetenus(callable $retenu): Collection
    {
        $types = new Collection;
        if ($this->hasActiveSuperAdminProfile()) {
            $types->push('super_admin');
        }
        foreach (self::AGENCY_PROFILE_RELATIONS as $relation => $type) {
            if ($this->profileRows($relation)->contains($retenu)) {
                $types->push($type);
            }
        }
        $prestataire = $this->relationLoaded('serviceProviderProfile')
            ? $this->serviceProviderProfile
            : $this->serviceProviderProfile()->first();
        if ($prestataire !== null && ActiveProfileResolver::isActiveProfile($prestataire)) {
            $types->push('service_provider');
        }
        $types->push('customer');
        if ($this->hasActiveTenantLease()) {
            $types->push('tenant');
        }

        return $types->values();
    }

    /**
     * Les lignes d'une relation de profil d'agence : la relation préchargée quand elle l'est (une
     * liste de membres, TCK-653), sinon une lecture.
     */
    private function profileRows(string $relation): Collection
    {
        return $this->relationLoaded($relation) ? $this->getRelation($relation) : $this->{$relation}()->get();
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
        // TCK-653 — préchargée (liste des membres), la relation se filtre en mémoire, sur les
        // mêmes statuts : le préchargement peut l'avoir déjà restreinte, ou non.
        if ($this->relationLoaded('tenantLeases')) {
            return $this->tenantLeases->contains(
                fn ($lease) => in_array($lease->status?->value, self::ACTIVE_TENANT_LEASE_STATUSES, true),
            );
        }

        // ⚠ `leases.status` QUALIFIÉ, jamais `status` nu : `tenantLeases()` est
        // un `hasManyThrough` qui joint `customers`, et cette table porte elle
        // aussi une colonne `status`. PostgreSQL REFUSE l'ambiguïté au lieu de
        // l'arbitrer en silence comme le faisaient MySQL et SQLite (piège n° 7
        // de CLAUDE.md) — ici la requête aurait filtré sur le statut du dossier
        // client, ou n'aurait pas tourné du tout.
        return $this->tenantLeases()
            ->whereIn('leases.status', self::ACTIVE_TENANT_LEASE_STATUSES)
            ->exists();
    }

    /**
     * TCK-653 — la relation de profil `$relation` a-t-elle au moins une ligne ? Relit la
     * relation préchargée quand elle l'est, sinon émet un `exists()`.
     */
    private function profileRelationExists(string $relation): bool
    {
        if (! $this->relationLoaded($relation)) {
            return $this->{$relation}()->exists();
        }

        $loaded = $this->getRelation($relation);

        return $loaded instanceof Collection ? $loaded->isNotEmpty() : $loaded !== null;
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
        return $this->activePlatformLevel() === PlatformProfileLevel::SuperAdmin;
    }

    /**
     * TCK-600 (ADR-0047) — un `PlatformProfile` ACTIF, de quelque niveau que ce soit : la
     * condition d'entrée dans la console, et ce qui interdit d'impersonner un compte.
     */
    public function hasActivePlatformProfile(): bool
    {
        return $this->activePlatformLevel() !== null;
    }

    /**
     * TCK-711 — un profil plateforme, ACTIF OU NON (ce que lisaient les `platformProfile()->exists()`
     * de la 2FA). Relit la relation quand `ResolveActiveProfile` l'a chargée pour la requête.
     */
    public function holdsPlatformProfile(): bool
    {
        return $this->profileRelationExists('platformProfile');
    }

    /** TCK-600 — le niveau du profil plateforme ACTIF, ou `null`. */
    public function activePlatformLevel(): ?PlatformProfileLevel
    {
        $profile = $this->relationLoaded('platformProfile')
            ? $this->platformProfile
            : $this->platformProfile()->active()->first();

        return $profile !== null && $profile->isActive() ? $profile->level : null;
    }

    /** TCK-600 (ADR-0047) — l'opérateur détient-il ce geste de la console ? */
    public function hasPlatformAbility(PlatformAbility $ability): bool
    {
        $level = $this->activePlatformLevel();

        return $level !== null && $ability->grantedTo($level);
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
