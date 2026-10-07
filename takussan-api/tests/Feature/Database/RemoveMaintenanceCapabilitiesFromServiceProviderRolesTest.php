<?php

namespace Tests\Feature\Database;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-592 — AC17, dernière phrase : après la migration de données, aucun rôle SYSTÈME
 * `service_provider` ne porte `maintenance.*`. Un rôle personnalisé, une capacité d'une autre
 * famille et un rôle système d'un autre type sont les témoins de ce qu'elle ne touche pas.
 */
class RemoveMaintenanceCapabilitiesFromServiceProviderRolesTest extends TestCase
{
    use RefreshDatabase;

    public function test_system_provider_roles_lose_maintenance_capabilities_and_nothing_else(): void
    {
        $agency = Agency::factory()->create();
        $grant = [Capability::MaintenanceAssign, Capability::MaintenanceClose, Capability::MessagingArchive];

        // L'agence sème ses rôles système à la création (un par type) : on remet sur les siens ce
        // que l'ancien catalogue y posait.
        $system = $this->systemRole($agency, AgencyRoleBaseType::ServiceProvider);
        $agent = $this->systemRole($agency, AgencyRoleBaseType::Agent);
        foreach ([$system, $agent] as $role) {
            foreach ($grant as $capability) {
                DB::table('agency_role_capabilities')->insertOrIgnore([
                    'agency_role_id' => $role->id,
                    'capability' => $capability->value,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
        $custom = AgencyRole::factory()->ofType(AgencyRoleBaseType::ServiceProvider)
            ->withCapabilities($grant)->create(['agency_id' => $agency->id]);

        (require database_path('migrations/2026_10_07_120200_remove_maintenance_capabilities_from_service_provider_system_roles.php'))->up();

        $this->assertSame(['messaging.archive'], $this->capabilitiesOf($system));
        $this->assertSame(['maintenance.assign', 'maintenance.close', 'messaging.archive'], $this->capabilitiesOf($custom));
        $this->assertContains('maintenance.assign', $this->capabilitiesOf($agent));
        $this->assertContains('maintenance.close', $this->capabilitiesOf($agent));

        $this->assertSame(0, DB::table('agency_role_capabilities')
            ->join('agency_roles', 'agency_roles.id', '=', 'agency_role_capabilities.agency_role_id')
            ->where('agency_roles.is_system', true)
            ->where('agency_roles.base_profile_type', 'service_provider')
            ->where('agency_role_capabilities.capability', 'like', 'maintenance.%')
            ->count());
    }

    private function systemRole(Agency $agency, AgencyRoleBaseType $type): AgencyRole
    {
        return AgencyRole::query()->where('agency_id', $agency->id)->where('is_system', true)
            ->where('base_profile_type', $type->value)->sole();
    }

    /** @return list<string> */
    private function capabilitiesOf(AgencyRole $role): array
    {
        return DB::table('agency_role_capabilities')->where('agency_role_id', $role->id)
            ->orderBy('capability')->pluck('capability')->all();
    }
}
