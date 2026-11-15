<?php

namespace Tests\Feature\Database;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-2640 — `owners.update` (régler le plafond de travaux d'un bailleur du carnet) entre au
 * catalogue. `membership:reconcile-system-roles` la donne aux rôles SYSTÈME ; un admin dont le profil
 * pointe un rôle PERSONNALISÉ de base `agency_admin` ne l'aurait jamais. La migration de données
 * l'insère dans ces seuls rôles, en ajout seul et idempotente ; les rôles d'un autre type et les
 * autres capacités sont les témoins de ce qu'elle ne touche pas. Même forme que TCK-2260.
 */
class AddOwnersUpdateToCustomAgencyAdminRolesTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'migrations/2026_11_11_121000_add_owners_update_to_custom_agency_admin_roles.php';

    public function test_les_roles_personnalises_d_admin_recoivent_la_capacite_et_rien_d_autre_ne_bouge(): void
    {
        $agency = Agency::factory()->create();
        $customAdmin = AgencyRole::factory()->ofType(AgencyRoleBaseType::AgencyAdmin)
            ->withCapabilities([Capability::TeamInvite, Capability::ReportsViewAgency])
            ->create(['agency_id' => $agency->id]);
        $customAgent = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PaymentsRecord])
            ->create(['agency_id' => $agency->id]);
        $systemAdmin = $this->systemRole($agency, AgencyRoleBaseType::AgencyAdmin);
        $systemAgent = $this->systemRole($agency, AgencyRoleBaseType::Agent);
        $before = [
            'systemAdmin' => $this->capabilitiesOf($systemAdmin),
            'systemAgent' => $this->capabilitiesOf($systemAgent),
        ];

        // L'admin du rôle personnalisé, lu une fois AVANT la migration : le résolveur met le rôle en
        // cache, et la migration doit l'oublier pour que l'ajout agisse tout de suite.
        $admin = User::factory()->withTwoFactor()->create();
        AgencyAdminProfile::factory()->create([
            'user_id' => $admin->id, 'agency_id' => $agency->id, 'agency_role_id' => $customAdmin->id,
        ]);
        $this->assertFalse($admin->canActAt(Capability::OwnersUpdate, $agency));

        $this->up();
        $this->up(); // idempotente : un second passage n'ajoute ni ne casse rien

        $this->assertSame(['owners.update', 'reports.view_agency', 'team.invite'], $this->capabilitiesOf($customAdmin));
        $this->assertSame(['payments.record'], $this->capabilitiesOf($customAgent));
        $this->assertSame($before['systemAdmin'], $this->capabilitiesOf($systemAdmin));
        $this->assertSame($before['systemAgent'], $this->capabilitiesOf($systemAgent));
        $this->assertTrue($admin->fresh()->canActAt(Capability::OwnersUpdate, $agency));
    }

    public function test_down_retire_la_capacite_des_seuls_roles_personnalises_d_admin(): void
    {
        $agency = Agency::factory()->create();
        $customAdmin = AgencyRole::factory()->ofType(AgencyRoleBaseType::AgencyAdmin)
            ->withCapabilities([Capability::TeamInvite])
            ->create(['agency_id' => $agency->id]);
        // Un rôle d'agent auquel l'éditeur a donné la capacité : la migration ne la lui a pas
        // donnée, son `down()` ne la lui retire pas.
        $customAgent = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::OwnersUpdate])
            ->create(['agency_id' => $agency->id]);
        $systemAdmin = $this->systemRole($agency, AgencyRoleBaseType::AgencyAdmin);

        $this->up();
        (require database_path(self::MIGRATION))->down();

        $this->assertSame(['team.invite'], $this->capabilitiesOf($customAdmin));
        $this->assertSame(['owners.update'], $this->capabilitiesOf($customAgent));
        $this->assertContains('owners.update', $this->capabilitiesOf($systemAdmin));
    }

    private function up(): void
    {
        (require database_path(self::MIGRATION))->up();
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
