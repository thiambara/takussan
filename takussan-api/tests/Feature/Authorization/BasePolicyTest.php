<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use App\Policies\BasePolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
        $this->policy = new TestPropertiesPolicy;
        $this->agency = Agency::factory()->create();
    }

    public function test_user_with_view_permission_can_view_any_and_view(): void
    {
        // TCK-278 — `properties.view` / `properties.create` n'existent plus
        // comme capacités atomiques : la nouvelle table de vérité du
        // `MembershipCapabilityResolver` ne définit pas de CRUD générique.
        // La vue/création d'une Property passe désormais par `PropertyPolicy`
        // (auto-discovered) qui applique des règles métier explicites.
        $this->markTestSkipped('Obsolète depuis TCK-278 — la sémantique CRUD générique est remplacée par des policies métier.');
    }

    public function test_user_with_create_permission_can_create(): void
    {
        $this->markTestSkipped('Obsolète depuis TCK-278 — voir test_user_with_view_permission_can_view_any_and_view.');
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

        $this->assertFalse($this->policy->viewAny($user));
        $this->assertFalse($this->policy->create($user));
    }

    protected function userWithRole(string $role): User
    {
        $user = User::factory()->create(['agency_id' => $this->agency->id]);
        // TCK-278 — Le rôle est matérialisé par un profil polymorphe
        // (cf. Règle 5). `super_admin` → PlatformProfile global ;
        // les autres rôles → profil agence-scopé.
        $this->materializeRoleProfile($user, $role, $this->agency);

        return $user;
    }
}
