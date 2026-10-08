<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-591 — le CRM de l'agence est celui de son personnel (AC16, AC17).
 */
class CustomerScopeTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
    }

    private function member(string $role): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, $role, $this->agency);

        return $user;
    }

    private function create(User $as)
    {
        return $this->actingAsApi($as)->apiPost('/api/customers', ['first_name' => 'Awa', 'last_name' => 'Diop']);
    }

    /** AC17 */
    public function test_only_staff_creates_a_customer(): void
    {
        $this->create(User::factory()->create())->assertForbidden();
        $this->create($this->member('owner'))->assertForbidden();
        $this->assertDatabaseCount('customers', 0);

        $this->create($this->member('agent'))
            ->assertCreated()
            ->assertJsonPath('data.agency_id', $this->agency->id);
        $this->create($this->member('agency_admin'))->assertCreated();
    }

    /**
     * AC16 — la liste et les compteurs du pipeline suivent `CustomerPolicy::view`
     * (`Customer::scopeVisibleTo`) : le bailleur ne voit que sa fiche, le personnel sans
     * `crm.view_all` que ses ajouts, le personnel qui la tient toute l'agence.
     */
    public function test_the_list_and_the_pipeline_counts_follow_the_view_rule(): void
    {
        $agent = $this->member('agent');
        $landlord = $this->member('owner');
        $mine = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $landlord->id]);
        Customer::factory()->count(3)->create(['agency_id' => $this->agency->id, 'added_by_id' => $agent->id]);
        // Une autre agence : personne ici n'en voit rien.
        Customer::factory()->create(['agency_id' => Agency::factory()->create()->id, 'added_by_id' => null]);

        $this->assertSame([$mine->id], $this->listed($landlord));
        $this->assertSame(1, $this->counted($landlord));

        $this->assertCount(4, $this->listed($agent));
        $this->assertSame(4, $this->counted($agent));

        $withoutViewAll = $this->agentWithout($this->agency, Capability::CrmViewAll);
        $this->assertSame([], $this->listed($withoutViewAll));
        $this->assertSame(0, $this->counted($withoutViewAll));

        foreach ([$landlord, $agent, $withoutViewAll] as $user) {
            foreach ($this->listed($user) as $id) {
                $this->assertTrue($user->can('view', Customer::query()->findOrFail($id)), "fiche {$id} rendue sans passer view");
            }
        }
    }

    /**
     * AC16 — le prédicat, pas la capacité seule : une agence peut donner `crm.view_all` au rôle de
     * ses bailleurs, et ce bailleur ne lit pas pour autant le CRM — il n'est pas du personnel.
     */
    public function test_a_landlord_holding_crm_view_all_still_sees_only_his_own(): void
    {
        $agent = $this->member('agent');
        $landlord = $this->member('owner');
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Owner)
            ->withCapabilities([Capability::PropertiesUpdateOwn, Capability::CrmViewAll])
            ->create(['agency_id' => $this->agency->id]);
        OwnerProfile::query()->where('user_id', $landlord->id)->update(['agency_role_id' => $role->id]);
        $mine = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $landlord->id]);
        Customer::factory()->count(3)->create(['agency_id' => $this->agency->id, 'added_by_id' => $agent->id]);

        $landlord = $landlord->fresh();
        $this->assertSame([$mine->id], $this->listed($landlord));
        $this->assertSame(1, $this->counted($landlord));
    }

    /**
     * verif-591 M1 — un bailleur ACTIF garde ses propres ajouts (§9) ; suspendu dans l'agence
     * (`blocked`), il n'est plus membre actif et ne les lit plus.
     */
    public function test_an_active_landlord_keeps_his_own_adds_a_blocked_one_does_not(): void
    {
        $landlord = $this->member('owner');
        $mine = Customer::factory()->create(['agency_id' => $this->agency->id, 'added_by_id' => $landlord->id]);

        $this->assertSame([$mine->id], $this->listed($landlord));
        $this->actingAsApi($landlord)->apiGet("/api/customers/{$mine->id}")->assertOk();
        $this->app['auth']->forgetGuards();

        OwnerProfile::query()->where('user_id', $landlord->id)->update(['status' => OwnerProfileStatus::Blocked->value]);
        $landlord = $landlord->fresh();
        $this->assertSame([], $this->listed($landlord));
        $this->actingAsApi($landlord)->apiGet("/api/customers/{$mine->id}")->assertForbidden();
    }

    /**
     * verif-591 m2 — les critères de recherche d'un client (budget, villes…) ne sortent que vers le
     * personnel de l'agence : le bailleur qui lit son bail avec `include=tenant` ne voit pas le
     * budget plafond de son locataire.
     */
    public function test_search_criteria_are_rendered_to_agency_staff_only(): void
    {
        $agent = $this->member('agent');
        $landlord = $this->member('owner');
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $landlord->id]);
        $tenant = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'added_by_id' => $agent->id,
            'budget_max' => 250000, 'seeking_cities' => ['Dakar'],
        ]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id, 'landlord_id' => $landlord->id,
            'tenant_id' => $tenant->id, 'agency_id' => $this->agency->id,
        ]);

        $seen = $this->actingAsApi($landlord)->apiGet("/api/leases/{$lease->id}?include=tenant")
            ->assertOk()->json('data.tenant');
        $this->assertSame($tenant->id, $seen['id']);
        $this->assertArrayNotHasKey('budget_max', $seen);
        $this->assertArrayNotHasKey('seeking_cities', $seen);
        $this->app['auth']->forgetGuards();

        $this->actingAsApi($agent)->apiGet("/api/customers/{$tenant->id}")
            ->assertOk()
            ->assertJsonPath('data.budget_max', '250000.00')
            ->assertJsonPath('data.seeking_cities', ['Dakar']);
    }

    /** @return list<int> */
    private function listed(User $as): array
    {
        $ids = collect($this->actingAsApi($as)->apiGet('/api/customers?per_page=50')->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();
        $this->app['auth']->forgetGuards();

        return $ids;
    }

    private function counted(User $as): int
    {
        $sum = array_sum($this->actingAsApi($as)->apiGet('/api/customers/pipeline-stats')->assertOk()->json('data.stage_counts'));
        $this->app['auth']->forgetGuards();

        return $sum;
    }
}
