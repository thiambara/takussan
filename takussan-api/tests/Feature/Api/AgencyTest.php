<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

class AgencyTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_creates_and_lists_agencies(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/agencies', [
            'name' => 'Takussan Immo',
            'email' => 'contact@takussan.sn',
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Takussan Immo');

        $this->getJson('/api/agencies')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_super_admin_can_list_all_agencies_with_sparse_fields(): void
    {
        $this->apiActingAsRole('super_admin');
        $agencyA = Agency::factory()->create(['name' => 'Alpha Scope']);
        $agencyB = Agency::factory()->create(['name' => 'Beta Scope']);

        $names = collect($this->getJson('/api/agencies?fields[agencies]=id,name,slug&filter[search]=Scope&sort=name&per_page=50')
            ->assertOk()
            ->json('data'))->pluck('name');

        $this->assertTrue($names->contains($agencyA->name));
        $this->assertTrue($names->contains($agencyB->name));
    }

    public function test_agency_admin_lists_only_profile_agencies(): void
    {
        $agencyA = Agency::factory()->create(['name' => 'Visible Agency']);
        $agencyB = Agency::factory()->create(['name' => 'Hidden Agency']);
        $this->apiActingAsRole('agency_admin', ['agency' => $agencyA]);

        $ids = collect($this->getJson('/api/agencies?per_page=50')
            ->assertOk()
            ->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($agencyA->id));
        $this->assertFalse($ids->contains($agencyB->id));
    }

    public function test_multi_agency_admin_lists_only_their_agencies(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $agencyC = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agencyA]);
        AgentProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agencyB->id]);

        $ids = collect($this->getJson('/api/agencies?per_page=50')
            ->assertOk()
            ->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($agencyA->id));
        $this->assertTrue($ids->contains($agencyB->id));
        $this->assertFalse($ids->contains($agencyC->id));
    }

    public function test_agency_show_masks_out_of_scope_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agencyA]);

        $this->getJson("/api/agencies/{$agencyA->id}?fields[agencies]=id,name,slug")
            ->assertOk()
            ->assertJsonPath('data.id', $agencyA->id);
        $this->getJson("/api/agencies/{$agencyB->id}?fields[agencies]=id,name,slug")
            ->assertNotFound();
    }

    public function test_user_without_agency_profile_gets_empty_agency_list(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/agencies')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }

    public function test_user_cannot_create_second_agency(): void
    {
        $user = User::factory()->create();
        Agency::factory()->create(['primary_admin_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->postJson('/api/agencies', ['name' => 'Second'])
            ->assertStatus(422);
    }

    public function test_only_primary_admin_can_update_agency(): void
    {
        $admin = User::factory()->create();
        $other = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        Sanctum::actingAs($other);
        $this->patchJson("/api/agencies/{$agency->id}", ['name' => 'hijack'])
            ->assertForbidden();

        Sanctum::actingAs($admin);
        $this->patchJson("/api/agencies/{$agency->id}", ['name' => 'New Name'])
            ->assertOk()
            ->assertJsonPath('data.name', 'New Name');
    }

    public function test_primary_admin_can_show_agency(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        Sanctum::actingAs($admin);

        $this->getJson("/api/agencies/{$agency->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $agency->id);
    }

    public function test_primary_admin_can_delete_agency(): void
    {
        $admin = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/agencies/{$agency->id}")->assertNoContent();
        $this->assertSoftDeleted('agencies', ['id' => $agency->id]);
    }

    public function test_non_primary_admin_cannot_delete_agency(): void
    {
        $admin = User::factory()->create();
        $other = User::factory()->create();
        $agency = Agency::factory()->create(['primary_admin_id' => $admin->id]);

        Sanctum::actingAs($other);

        $this->deleteJson("/api/agencies/{$agency->id}")->assertForbidden();
    }
}
