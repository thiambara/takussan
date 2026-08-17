<?php

namespace App\Services\Membership;

use App\Models\Agency;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
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
 * Phase 3 (TCK-315, ADR-0015) : la branche `service_provider` rejoint le
 * pivot elle aussi, via `service_provider_agency_collaborations.agency_role_id`.
 * **Plus aucun chemin d'autorisation ne court-circuite le pivot** — cette
 * classe ne lit plus {@see SystemRoleCapabilities} du tout.
 *
 * La table de vérité phase 1 n'a pas disparu : elle a été extraite dans
 * {@see SystemRoleCapabilities} et sert désormais de **seed** aux rôles
 * système de chaque agence. Un rôle personnalisé s'en écarte librement.
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
        $platform = $this->resolvePlatform($user, $capability);
        if ($platform === true) {
            return true;
        }

        if ($agency === null) {
            return false;
        }

        return $this->resolveAgencyScoped($user, $capability, $agency);
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
     * Branche prestataire — TCK-315 (ADR-0015).
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
