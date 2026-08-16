<?php

namespace App\Services\Membership;

use App\Models\Agency;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformProfileLevel;
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
        private readonly SystemRoleCapabilities $catalog,
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

        // `ServiceProviderProfile` n'a pas de pointeur `agency_role_id` :
        // il est user-scopé et collabore avec N agences (cf. migration
        // 120200 de TCK-279). Tant que la décision n'est pas prise — rôle
        // porté par la collaboration, ou profil rendu agence-scopé — cette
        // branche reste sur la table de vérité phase 1, qui est aussi la
        // source du rôle système `service_provider` seedé par agence : les
        // deux chemins donnent donc le même résultat par défaut.
        if ($user->isProviderAt($agencyId)) {
            return in_array($capability, $this->catalog->for(AgencyRoleBaseType::ServiceProvider), true);
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
