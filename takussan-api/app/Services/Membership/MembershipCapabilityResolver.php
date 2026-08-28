<?php

namespace App\Services\Membership;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\RoleDelegation;
use App\Models\User;

/**
 * TCK-278 → TCK-279 — Résolveur de capacités. Mappe `(User, Capability,
 * ?Agency)` → bool en consultant les profils du user.
 *
 * Phase 1 (TCK-278) : table de vérité code-defined par type de profil.
 * Phase 2 (TCK-279) : consulte le pivot `agency_role_capabilities` via le
 * pointeur `agency_role_id` du profil. **La signature publique de cette
 * classe n'a pas bougé** — les sites d'appel `$user->canActAt(Capability,
 * ?Agency)` sont intacts, ce que garde
 * `MembershipCapabilityResolverSignatureTest`.
 *
 * Phase 3 (TCK-315, ADR-0016) : la branche `service_provider` rejoint le
 * pivot elle aussi, via `service_provider_agency_collaborations.agency_role_id`.
 * **Plus aucun chemin d'autorisation ne court-circuite le pivot** — cette
 * classe ne lit plus {@see SystemRoleCapabilities} du tout.
 *
 * La table de vérité phase 1 n'a pas disparu : elle a été extraite dans
 * {@see SystemRoleCapabilities} et sert désormais de **seed** aux rôles
 * système de chaque agence. Un rôle personnalisé s'en écarte librement.
 *
 * Phase 4 (TCK-395) : les `RoleDelegation` actives sont consultées ICI, et
 * plus seulement par `hasActiveAgencyDelegation()`. Deux défauts mesurés le
 * 2026-08-27 en sont la cause :
 *
 *  1. `config('role_delegations.delegable_roles')` offrait `agency_admin`,
 *     `agent` et `owner`, mais les six sites d'appel du dépôt n'interrogeaient
 *     QUE `'agency_admin'`. Déléguer `agent` ou `owner` écrivait une ligne,
 *     émettait trois événements, envoyait deux notifications, s'affichait
 *     « Active » — et n'accordait **rien, nulle part**.
 *  2. La délégation était **le seul chemin du dépôt où une capacité
 *     s'obtenait sans passer par le pivot `agency_role_capabilities`** : le
 *     délégant pouvait accorder la chaîne `'agency_admin'` en entier, donc
 *     PLUS que ce que son propre `AgencyRole` porte depuis TCK-279. C'est
 *     exactement ce que TCK-315 avait fermé pour la branche prestataire ;
 *     celui-ci était resté ouvert.
 *
 * Modèle additif : si plusieurs profils dans la même agence accordent la
 * capacité, l'autorisation est OR (au moins un profil suffit).
 */
class MembershipCapabilityResolver
{
    public function __construct(
        private readonly AgencyRoleCapabilityCache $cache,
    ) {}

    /**
     * @return bool Vrai si l'un des profils actifs du user — plateforme ou
     *              dans l'agence cible — accorde la capacité demandée.
     */
    public function allows(User $user, Capability $capability, ?Agency $agency = null): bool
    {
        if ($this->resolveDirect($user, $capability, $agency)) {
            return true;
        }

        if ($agency === null) {
            return false;
        }

        return $this->delegationAllows($user, $capability, $agency);
    }

    /**
     * Les capacités que le user tient EN PROPRE, délégations exclues.
     *
     * TCK-395 (revue) — exposée parce qu'un geste au moins doit pouvoir exiger
     * la détention propre : **déléguer**. `RoleDelegationPolicy` l'emprunte.
     * Laisser ce geste passer par `allows()` rendait le droit de déléguer
     * lui-même délégable, et fabriquait exactement le défaut que TCK-395
     * ferme — cf. le docblock de la policy.
     */
    public function allowsDirectly(User $user, Capability $capability, ?Agency $agency = null): bool
    {
        return $this->resolveDirect($user, $capability, $agency);
    }

    /**
     * Les capacités que le user tient de LUI-MÊME — profil plateforme ou
     * `AgencyRole` porté par un de ses profils dans l'agence. **Aucune
     * délégation n'est consultée ici, et c'est structurel** : c'est cette
     * méthode que {@see self::delegationAllows()} appelle sur le DÉLÉGANT,
     * ce qui rend la délégation non transitive par construction. Un délégué
     * ne peut donc pas re-déléguer ce qu'il n'a lui-même que par délégation,
     * et deux délégations croisées ne peuvent pas s'entre-accorder un droit
     * que personne ne détient.
     */
    private function resolveDirect(User $user, Capability $capability, ?Agency $agency): bool
    {
        if ($this->resolvePlatform($user, $capability)) {
            return true;
        }

        if ($agency === null) {
            return false;
        }

        return $this->resolveAgencyScoped($user, $capability, $agency);
    }

    /**
     * Branche délégation — TCK-395.
     *
     * Une délégation active accorde la capacité `$capability` si, et seulement
     * si, les DEUX conditions tiennent :
     *
     *  1. le **rôle système** du type délégué, dans cette agence, la porte —
     *     c'est ce qui donne enfin un sens à `agent` et `owner`, et ce qui fait
     *     passer la délégation par le pivot `agency_role_capabilities` comme
     *     tout le reste depuis TCK-315 ;
     *  2. le **délégant la détient encore lui-même**, en propre. C'est la
     *     borne qui manquait : `RoleDelegationService::create()` vérifie
     *     l'auto-délégation, l'appartenance à l'agence et le statut
     *     d'administrateur principal — il ne compare **jamais** le rôle
     *     délégué aux capacités du délégant.
     *
     * ⚠ La borne est évaluée **à la lecture**, pas figée à la création. Un
     * délégant dépouillé de X après coup cesse de conférer X, ce qu'un
     * instantané pris à l'écriture ne saurait pas faire. C'est aussi ce qui
     * permet au test d'AC1 de prouver la borne *par exécution d'un geste*
     * derrière la délégation plutôt que par un assert sur un champ.
     *
     * ⚠ La fenêtre d'activité reprend celle de
     * `HasProfiles::hasActiveAgencyDelegation()` — statut `Active` ET
     * (`ends_at` nul OU futur) — et **non** `RoleDelegation::scopeActive()`,
     * qui exige en plus `ends_at >= now()` et rejette donc une délégation sans
     * fin. Les deux définitions cohabitent dans le dépôt ; adopter la seconde
     * ici aurait fait diverger cette branche des six sites d'appel qu'elle
     * doit précisément rejoindre.
     */
    private function delegationAllows(User $user, Capability $capability, Agency $agency): bool
    {
        $agencyId = (int) $agency->id;

        $delegations = RoleDelegation::query()
            ->where('user_id', $user->id)
            ->where('agency_id', $agencyId)
            ->where('status', RoleDelegationStatus::Active)
            ->where(function ($query): void {
                $query->whereNull('ends_at')->orWhere('ends_at', '>', now());
            })
            ->get();

        foreach ($delegations as $delegation) {
            $type = AgencyRoleBaseType::tryFrom((string) $delegation->role);
            if ($type === null) {
                continue;
            }

            if (! $this->systemRoleAllows($agencyId, $type, $capability)) {
                continue;
            }

            $delegator = $delegation->delegator;
            if ($delegator === null) {
                continue;
            }

            if ($this->resolveDirect($delegator, $capability, $agency)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Le rôle SYSTÈME de ce type, dans cette agence, porte-t-il la capacité ?
     *
     * On vise `is_system` et non un rôle personnalisé : une délégation nomme un
     * TYPE (`agent`, `owner`, `agency_admin`), pas un rôle précis — et une
     * agence peut porter plusieurs rôles personnalisés du même type. Le rôle
     * système est le seul qu'il y ait exactement un par type et par agence.
     */
    private function systemRoleAllows(int $agencyId, AgencyRoleBaseType $type, Capability $capability): bool
    {
        $roleId = AgencyRole::query()
            ->where('agency_id', $agencyId)
            ->where('base_profile_type', $type)
            ->where('is_system', true)
            ->value('id');

        return $roleId !== null && $this->cache->allows((int) $roleId, $capability);
    }

    /**
     * Branche PlatformProfile. `super_admin` court-circuite tout ; `support`
     * et `viewer` ont une liste blanche restreinte. Non concernée par
     * TCK-279 : un `PlatformProfile` n'a pas d'`AgencyRole` (pas d'agence
     * à scoper — cf. Règle 6, dernier point).
     */
    private function resolvePlatform(User $user, Capability $capability): bool
    {
        $profile = $user->relationLoaded('platformProfile')
            ? $user->platformProfile
            : $user->platformProfile()->active()->first();

        if ($profile === null || ! $profile->isActive()) {
            return false;
        }

        return match ($profile->level) {
            PlatformProfileLevel::SuperAdmin => true,
            PlatformProfileLevel::Support => in_array($capability, [
                Capability::CrmViewAll,
                Capability::CrmExport,
                Capability::PaymentsExport,
                Capability::ReportsViewGlobal,
                Capability::ReportsExport,
                Capability::MessagingArchive,
            ], true),
            PlatformProfileLevel::Viewer => in_array($capability, [
                Capability::ReportsViewGlobal,
            ], true),
        };
    }

    /**
     * Branche agency-scoped. On agrège les capacités accordées par chaque
     * profil actif du user dans `$agency` (modèle additif). Chaque profil
     * répond via SON `AgencyRole` — un rôle personnalisé peut donc être
     * plus, ou moins, permissif que le rôle système de son type.
     */
    private function resolveAgencyScoped(User $user, Capability $capability, Agency $agency): bool
    {
        $agencyId = (int) $agency->id;

        foreach (AgencyRoleBaseType::assignableTypes() as $type) {
            if ($this->roleAllows($user, $agencyId, $type, $capability)) {
                return true;
            }
        }

        return $this->serviceProviderRoleAllows($user, $agencyId, $capability);
    }

    /**
     * Branche prestataire — TCK-315 (ADR-0016).
     *
     * `ServiceProviderProfile` n'a pas de pointeur `agency_role_id` et n'en
     * aura pas : il est user-scopé (`user_id` UNIQUE, aucune colonne
     * `agency_id`) et sert N agences. C'est sa COLLABORATION qui porte le
     * rôle, une par agence — d'où une requête différente de
     * {@see self::roleAllows()}, et non un traitement différent.
     *
     * Auparavant, cette branche répondait depuis `SystemRoleCapabilities`
     * pour tout prestataire collaborant avec l'agence. Le verdict était le
     * même par défaut — le catalogue est la source du rôle système seedé —
     * mais un rôle PERSONNALISÉ créé pour un prestataire n'avait aucun
     * effet, et rien ne le disait.
     */
    private function serviceProviderRoleAllows(User $user, int $agencyId, Capability $capability): bool
    {
        $roleIds = ServiceProviderAgencyCollaboration::query()
            ->where('agency_id', $agencyId)
            ->whereNotNull('agency_role_id')
            ->whereHas('serviceProviderProfile', fn ($query) => $query->where('user_id', $user->id))
            ->pluck('agency_role_id');

        foreach ($roleIds as $roleId) {
            if ($this->cache->allows((int) $roleId, $capability)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Le user a-t-il, dans cette agence, un profil du type donné dont le
     * rôle accorde la capacité ?
     */
    private function roleAllows(User $user, int $agencyId, AgencyRoleBaseType $type, Capability $capability): bool
    {
        $class = $type->profileClass();
        if ($class === null) {
            return false;
        }

        $roleIds = $class::query()
            ->where('user_id', $user->id)
            ->where('agency_id', $agencyId)
            ->whereNotNull('agency_role_id')
            ->pluck('agency_role_id');

        foreach ($roleIds as $roleId) {
            if ($this->cache->allows((int) $roleId, $capability)) {
                return true;
            }
        }

        return false;
    }
}
