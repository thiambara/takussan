<?php

namespace App\Services\Membership;

use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;

/**
 * TCK-279 — table de vérité phase 1 (TCK-278), extraite du
 * `MembershipCapabilityResolver` pour devenir **le seed** des rôles
 * système `AgencyRole` (`is_system=true`).
 *
 * Une seule source : le seed d'une agence et le repli du résolveur lisent
 * cette classe. Si les deux divergeaient, une agence créée avant TCK-279
 * et une agence créée après n'auraient pas les mêmes droits par défaut —
 * et rien ne le dirait.
 */
class SystemRoleCapabilities
{
    /**
     * Capacités accordées par défaut au rôle système d'un type de profil.
     *
     * @return array<int,Capability>
     */
    public function for(AgencyRoleBaseType $type): array
    {
        return match ($type) {
            AgencyRoleBaseType::AgencyAdmin => $this->agencyAdmin(),
            AgencyRoleBaseType::Agent => $this->agent(),
            AgencyRoleBaseType::Owner => $this->owner(),
            AgencyRoleBaseType::ServiceProvider => $this->serviceProvider(),
        };
    }

    /**
     * @return array<int,string>
     */
    public function valuesFor(AgencyRoleBaseType $type): array
    {
        return array_map(static fn (Capability $c): string => $c->value, $this->for($type));
    }

    /**
     * `agency_admin` couvre tout le périmètre opérationnel agence ; les
     * opérations strictement plateforme restent aux PlatformProfile.
     *
     * @return array<int,Capability>
     */
    private function agencyAdmin(): array
    {
        return array_values(array_filter(
            Capability::cases(),
            static fn (Capability $c): bool => ! in_array($c, [
                Capability::PropertiesModerate,
                Capability::ReportsViewGlobal,
            ], true),
        ));
    }

    /**
     * @return array<int,Capability>
     */
    private function agent(): array
    {
        return [
            Capability::PropertiesCreate,
            Capability::PropertiesUpdateOwn,
            Capability::PropertiesPublish,
            Capability::BookingsValidate,
            Capability::BookingsCancel,
            Capability::LeasesCreate,
            Capability::LeasesSign,
            Capability::LeasesRenew,
            Capability::LeasesTerminate,
            Capability::LeasesRefundDeposit,
            Capability::LeasesRentReview,
            Capability::PaymentsRecord,
            Capability::InvoicesCreate,
            Capability::InvoicesSend,
            Capability::CrmViewAll,
            Capability::CrmAssign,
            Capability::MaintenanceAssign,
            Capability::MaintenanceClose,
        ];
    }

    /**
     * @return array<int,Capability>
     */
    private function owner(): array
    {
        return [Capability::PropertiesUpdateOwn];
    }

    /**
     * @return array<int,Capability>
     */
    private function serviceProvider(): array
    {
        return [
            Capability::MaintenanceAssign,
            Capability::MaintenanceClose,
        ];
    }
}
