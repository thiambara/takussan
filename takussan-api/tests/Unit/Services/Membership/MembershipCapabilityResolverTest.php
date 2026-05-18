<?php

namespace Tests\Unit\Services\Membership;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-278 — table de vérité du résolveur de capacités (phase 1).
 *
 * On vérifie chaque (Capability, ProfileType) clé pour qu'un changement
 * de mapping silencieux remonte en CI.
 */
class MembershipCapabilityResolverTest extends TestCase
{
    use RefreshDatabase;

    private MembershipCapabilityResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = app(MembershipCapabilityResolver::class);
    }

    public function test_super_admin_allows_everything(): void
    {
        $user = User::factory()->create();
        PlatformProfile::factory()->superAdmin()->create(['user_id' => $user->id]);
        $agency = Agency::factory()->create();

        foreach (Capability::cases() as $capability) {
            $this->assertTrue(
                $this->resolver->allows($user, $capability, $agency),
                "super_admin doit autoriser {$capability->value}",
            );
        }
    }

    public function test_revoked_platform_profile_does_not_grant(): void
    {
        $user = User::factory()->create();
        PlatformProfile::factory()->superAdmin()->revoked()->create(['user_id' => $user->id]);

        $this->assertFalse($this->resolver->allows($user, Capability::ReportsViewGlobal));
    }

    public function test_viewer_only_allows_reports_view_global(): void
    {
        $user = User::factory()->create();
        PlatformProfile::factory()->create(['user_id' => $user->id]); // default = viewer

        $this->assertTrue($this->resolver->allows($user, Capability::ReportsViewGlobal));
        $this->assertFalse($this->resolver->allows($user, Capability::ReportsExport));
        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesCreate, Agency::factory()->create()));
    }

    public function test_support_has_read_export_subset(): void
    {
        $user = User::factory()->create();
        PlatformProfile::factory()->support()->create(['user_id' => $user->id]);

        $this->assertTrue($this->resolver->allows($user, Capability::CrmViewAll));
        $this->assertTrue($this->resolver->allows($user, Capability::PaymentsExport));
        $this->assertFalse($this->resolver->allows($user, Capability::PaymentsRefund));
        $this->assertFalse($this->resolver->allows($user, Capability::BookingsCancel));
    }

    public function test_no_agency_context_for_agency_scoped_capability_returns_false(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        // Sans agency, même un admin n'a pas la capacité agency-scoped.
        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesCreate, null));
    }

    public function test_agency_admin_allows_operational_capabilities_in_own_agency(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        foreach ([
            Capability::AgencyUpdate,
            Capability::TeamInvite,
            Capability::PropertiesCreate,
            Capability::PropertiesPublish,
            Capability::BookingsCancel,
            Capability::LeasesTerminate,
            Capability::PaymentsRefund,
            Capability::PayoutsApprove,
            Capability::RolesCreateCustom,
        ] as $cap) {
            $this->assertTrue($this->resolver->allows($user, $cap, $agency), "agency_admin doit avoir {$cap->value}");
        }

        // Capacités plateforme : pas pour agency_admin.
        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesModerate, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::ReportsViewGlobal, $agency));
    }

    public function test_agency_admin_does_not_leak_across_agencies(): void
    {
        $user = User::factory()->create();
        $home = Agency::factory()->create();
        $other = Agency::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $home->id]);

        $this->assertTrue($this->resolver->allows($user, Capability::PropertiesCreate, $home));
        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesCreate, $other));
    }

    public function test_agent_truth_table_subset(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->assertTrue($this->resolver->allows($user, Capability::PropertiesCreate, $agency));
        $this->assertTrue($this->resolver->allows($user, Capability::BookingsValidate, $agency));
        $this->assertTrue($this->resolver->allows($user, Capability::MaintenanceAssign, $agency));

        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesDelete, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::PaymentsRefund, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::TeamInvite, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::RolesCreateCustom, $agency));
    }

    public function test_owner_only_updates_own_properties(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->assertTrue($this->resolver->allows($user, Capability::PropertiesUpdateOwn, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::PropertiesCreate, $agency));
        $this->assertFalse($this->resolver->allows($user, Capability::BookingsValidate, $agency));
    }

    public function test_additive_model_when_user_holds_two_profiles(): void
    {
        // agent + owner dans la même agence : capacité = OR
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->assertTrue($this->resolver->allows($user, Capability::PropertiesCreate, $agency)); // agent
        $this->assertTrue($this->resolver->allows($user, Capability::PropertiesUpdateOwn, $agency)); // both
    }
}
