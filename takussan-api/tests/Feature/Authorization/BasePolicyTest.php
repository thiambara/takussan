<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Policies\BasePolicy;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Test-only policy exercising BasePolicy behavior against the `properties`
 * resource — mirrors how a real PropertyPolicy would declare itself.
 */
class TestPropertiesPolicy extends BasePolicy
{
    protected function resource(): string
    {
        return 'properties';
    }
}

class BasePolicyTest extends TestCase
{
    use RefreshDatabase;

    protected TestPropertiesPolicy $policy;

    protected Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->policy = new TestPropertiesPolicy;
        $this->agency = Agency::factory()->create();
    }

    public function test_user_with_view_permission_can_view_any_and_view(): void
    {
        $user = $this->userWithRole('agent');
        $property = new Property;

        $this->assertTrue($this->policy->viewAny($user));
        $this->assertTrue($this->policy->view($user, $property));
    }

    public function test_user_with_create_permission_can_create(): void
    {
        $user = $this->userWithRole('agent');

        $this->assertTrue($this->policy->create($user));
    }

    public function test_user_without_delete_permission_cannot_delete(): void
    {
        $user = $this->userWithRole('agent');
        $property = new Property;

        $this->assertFalse($this->policy->delete($user, $property));
    }

    public function test_customer_cannot_update_or_delete_properties(): void
    {
        $user = $this->userWithRole('customer');
        $property = new Property;

        $this->assertFalse($this->policy->update($user, $property));
        $this->assertFalse($this->policy->delete($user, $property));
    }

    public function test_super_admin_bypasses_all_policy_checks_via_gate_before(): void
    {
        $user = $this->userWithRole('super_admin');
        $property = new Property;

        $this->assertTrue($user->can('viewAny', Property::class));
        $this->assertTrue($user->can('create', Property::class));
        $this->assertTrue($user->can('update', $property));
        $this->assertTrue($user->can('delete', $property));
    }

    public function test_user_without_any_role_is_denied_via_policy(): void
    {
        $user = User::factory()->create(['agency_id' => $this->agency->id]);
        app(PermissionRegistrar::class)->setPermissionsTeamId($this->agency->id);

        $this->assertFalse($this->policy->viewAny($user));
        $this->assertFalse($this->policy->create($user));
    }

    protected function userWithRole(string $role): User
    {
        $user = User::factory()->create(['agency_id' => $this->agency->id]);
        app(PermissionRegistrar::class)->setPermissionsTeamId($this->agency->id);
        $user->assignRole($role);

        return $user;
    }
}
