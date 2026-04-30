<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class SettingTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_manage_global_settings(): void
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        Role::findOrCreate('super_admin');
        $admin->assignRole('super_admin');

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/settings', [
            'key' => 'site_name',
            'value' => ['name' => 'Takussan'],
            'scope' => SettingScope::Global->value,
            'scope_id' => null,
        ])->assertCreated()
            ->assertJsonPath('data.key', 'site_name');

        $settingId = $response->json('data.id');

        $this->putJson("/api/settings/{$settingId}", [
            'value' => ['name' => 'Takussan Updated'],
        ])->assertOk()
            ->assertJsonPath('data.value.name', 'Takussan Updated');

        $this->getJson('/api/settings')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->deleteJson("/api/settings/{$settingId}")
            ->assertNoContent();
    }

    public function test_agency_admin_can_manage_agency_settings(): void
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $agencyAdmin = User::factory()->create(['agency_id' => $agency->id]);
        Role::findOrCreate('agency_admin');
        $agencyAdmin->assignRole('agency_admin');

        Sanctum::actingAs($agencyAdmin);

        $this->postJson('/api/settings', [
            'key' => 'invoice_prefix',
            'value' => ['prefix' => 'INV-'],
            'scope' => SettingScope::Agency->value,
        ])->assertCreated()
            ->assertJsonPath('data.scope_id', $agency->id);
    }

    public function test_list_accepts_value_in_sparse_fieldset(): void
    {
        // Regression (review): the frontend admin UI requests
        // `fields[settings]=id,key,value,scope,...` — the `value` column
        // must be in the model's allowedFields list or spatie returns 400.
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        Role::findOrCreate('super_admin');
        $admin->assignRole('super_admin');

        Sanctum::actingAs($admin);

        $this->postJson('/api/settings', [
            'key' => 'site_name',
            'value' => ['name' => 'Takussan'],
            'scope' => SettingScope::Global->value,
            'scope_id' => null,
        ])->assertCreated();

        $this->getJson('/api/settings?fields[settings]=id,key,value,scope,scope_id,updated_by_id,updated_at')
            ->assertOk()
            ->assertJsonPath('data.0.value.name', 'Takussan');
    }

    public function test_regular_agent_cannot_manage_settings(): void
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        Role::findOrCreate('agent');
        $agent->assignRole('agent');

        Sanctum::actingAs($agent);

        $this->postJson('/api/settings', [
            'key' => 'invoice_prefix',
            'value' => ['prefix' => 'INV-'],
            'scope' => SettingScope::Agency->value,
        ])->assertForbidden();
    }
}
