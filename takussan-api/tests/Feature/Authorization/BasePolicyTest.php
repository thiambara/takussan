<?php

namespace Tests\Feature\Authorization;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\User;
use App\Policies\BasePolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Test-only policy exercising BasePolicy behavior against the `properties`
 * resource — mirrors how a real PropertyPolicy would declare itself.
 *
 * TCK-297 — déclarait `resource(): string` et laissait `BasePolicy`
 * concaténer. Les capacités sont désormais DÉSIGNÉES. Le comportement testé
 * plus bas est inchangé : `create` et `delete` existent dans l'enum, `view` et
 * `update` génériques n'y existent pas. La différence est qu'ils sont
 * maintenant **absents parce qu'on ne les déclare pas**, au lieu d'être
 * **fabriqués puis introuvables** — la même issue, atteinte volontairement.
 */
class TestPropertiesPolicy extends BasePolicy
{
    protected function createCapability(): ?Capability
    {
        return Capability::PropertiesCreate;
    }

    protected function deleteCapability(): ?Capability
    {
        return Capability::PropertiesDelete;
    }
}

/**
 * BasePolicy maps each CRUD method to a `{resource}.{action}` ability and
 * defers to the Gate. Since TCK-278 those abilities resolve through
 * `MembershipCapabilityResolver`, so a method only grants access when a
 * matching `Capability` case exists *and* one of the user's profiles grants
 * it. The `properties` resource is a useful probe because its capability map
 * is deliberately partial:
 *
 *   - `properties.create` / `properties.delete` → real Capability cases.
 *   - `properties.view`                         → no atomic case (denied).
 *   - `properties.update`                       → only `update_own`/`update_any`
 *                                                  exist, so the generic ability
 *                                                  is undefined (denied).
 *
 * `super_admin` short-circuits everything via the global `Gate::before` hook.
 */
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

    public function test_view_abilities_have_no_atomic_capability_and_are_denied(): void
    {
        // TCK-278 — `properties.view` is not a Capability case: the generic
        // "read" CRUD ability no longer exists. Even an agency_admin, who
        // otherwise holds the full agency scope, is denied viewAny/view here.
        $admin = $this->userWithRole('agency_admin');
        $property = new Property;

        $this->assertFalse($this->policy->viewAny($admin));
        $this->assertFalse($this->policy->view($admin, $property));
    }

    public function test_generic_update_ability_has_no_atomic_capability_and_is_denied(): void
    {
        // TCK-278 — only `properties.update_own` / `properties.update_any`
        // exist; the generic `properties.update` ability BasePolicy emits is
        // undefined, so the Gate denies it even for an agency_admin.
        $admin = $this->userWithRole('agency_admin');
        $property = new Property;

        $this->assertFalse($this->policy->update($admin, $property));
    }

    public function test_agent_can_create_via_resolved_capability(): void
    {
        // `properties.create` IS a Capability case and `agent` profiles grant
        // it, so BasePolicy::create resolves to true.
        $agent = $this->userWithRole('agent');

        $this->assertTrue($this->policy->create($agent));
    }

    public function test_agency_admin_can_create_and_delete(): void
    {
        // The agency_admin profile grants the full agency operational scope,
        // covering both `properties.create` and `properties.delete`.
        $admin = $this->userWithRole('agency_admin');
        $property = new Property;

        $this->assertTrue($this->policy->create($admin));
        $this->assertTrue($this->policy->delete($admin, $property));
    }

    public function test_agent_without_delete_capability_cannot_delete(): void
    {
        // `agent` profiles are not granted `properties.delete`.
        $agent = $this->userWithRole('agent');
        $property = new Property;

        $this->assertFalse($this->policy->delete($agent, $property));
    }

    public function test_owner_cannot_create_or_delete_properties(): void
    {
        // `owner` profiles only carry `properties.update_own`; neither the
        // generic create nor delete abilities resolve for them.
        $owner = $this->userWithRole('owner');
        $property = new Property;

        $this->assertFalse($this->policy->create($owner));
        $this->assertFalse($this->policy->delete($owner, $property));
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
        $this->assertFalse($this->policy->delete($user, new Property));
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
