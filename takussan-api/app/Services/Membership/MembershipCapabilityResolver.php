<?php

namespace App\Services\Membership;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;

/**
 * TCK-278 — Résolveur de capacités. Mappe `(User, Capability, ?Agency)` →
 * bool en consultant les profils du user.
 *
 * Phase 1 (TCK-278) : table de vérité code-defined par type de profil.
 * Phase 2 (TCK-279) : consultera le pivot `agency_role_capabilities` ;
 * **la signature publique de cette classe ne bouge pas** pour que les
 * 500+ call sites créés en P2/P3 restent stables.
 *
 * Modèle additif : si plusieurs profils dans la même agence accordent la
 * capacité, l'autorisation est OR (au moins un profil suffit).
 */
class MembershipCapabilityResolver
{
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
     * et `viewer` ont une liste blanche restreinte.
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
     * type de profil actif du user dans `$agency` (modèle additif).
     */
    private function resolveAgencyScoped(User $user, Capability $capability, Agency $agency): bool
    {
        $agencyId = (int) $agency->id;

        if ($user->isAgencyAdminAt($agencyId) && $this->agencyAdminAllows($capability)) {
            return true;
        }

        if ($user->isAgentAt($agencyId) && $this->agentAllows($capability)) {
            return true;
        }

        if ($user->isOwnerAt($agencyId) && $this->ownerAllows($capability)) {
            return true;
        }

        if ($user->isProviderAt($agencyId) && $this->serviceProviderAllows($capability)) {
            return true;
        }

        return false;
    }

    /**
     * `agency_admin` reçoit tout sur son agence en phase 1 — sauf les
     * capacités strictement plateforme.
     */
    private function agencyAdminAllows(Capability $capability): bool
    {
        // L'agency_admin couvre tout le périmètre opérationnel agence ; les
        // opérations strictement plateforme (ex. modération transversale)
        // restent réservées aux PlatformProfile.
        return ! in_array($capability, [
            Capability::PropertiesModerate,
            Capability::ReportsViewGlobal,
        ], true);
    }

    private function agentAllows(Capability $capability): bool
    {
        return in_array($capability, [
            Capability::PropertiesCreate,
            Capability::PropertiesUpdateOwn,
            Capability::PropertiesPublish,
            Capability::BookingsValidate,
            Capability::BookingsCancel,
            Capability::LeasesCreate,
            Capability::LeasesSign,
            Capability::LeasesRenew,
            Capability::PaymentsRecord,
            Capability::InvoicesCreate,
            Capability::InvoicesSend,
            Capability::CrmViewAll,
            Capability::CrmAssign,
            Capability::MaintenanceAssign,
            Capability::MaintenanceClose,
        ], true);
    }

    private function ownerAllows(Capability $capability): bool
    {
        return $capability === Capability::PropertiesUpdateOwn;
    }

    private function serviceProviderAllows(Capability $capability): bool
    {
        return in_array($capability, [
            Capability::MaintenanceAssign,
            Capability::MaintenanceClose,
        ], true);
    }
}
