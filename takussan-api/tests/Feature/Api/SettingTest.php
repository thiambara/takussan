<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SettingTest extends TestCase
{
    use RefreshDatabase;

    /**
     * TCK-651 (ADR-0065) — la route brute ne fait plus la portée globale : le super-admin y règle la
     * portée d'une agence, et le global se règle au catalogue (`GenericSettingsCatalogueBypassTest`).
     */
    public function test_super_admin_can_manage_an_agency_setting(): void
    {
        $agency = Agency::factory()->create();
        // TCK-600 (raccord R1) : un profil plateforme écrit sous son second facteur — 2FA enrôlée et
        // confirmée sur la session. Le refus est gardé par PlatformSettingsTwoFactorTest.
        $admin = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($admin, 'super_admin');

        $this->actingAsWithStepUp($admin);

        $response = $this->postJson('/api/settings', [
            'key' => 'site_name',
            'value' => ['name' => 'Takussan'],
            'scope' => SettingScope::Agency->value,
            'scope_id' => $agency->id,
        ])->assertCreated()
            ->assertJsonPath('data.key', 'site_name')
            ->assertJsonPath('data.scope_id', $agency->id);

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
        $agencyAdmin = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($agencyAdmin, 'agency_admin', $agency);

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
        // TCK-600 (raccord R1) : un réglage global s'écrit sous le second facteur de la plateforme —
        // 2FA enrôlée et confirmée sur la session. Le refus est gardé par PlatformSettingsTwoFactorTest.
        $admin = User::factory()->withTwoFactor()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'super_admin');

        $this->actingAsWithStepUp($admin);

        // TCK-651 — la ligne est posée en base : la route brute n'écrit plus la portée globale.
        Setting::query()->create(['key' => 'site_name', 'value' => ['name' => 'Takussan'], 'scope' => SettingScope::Global]);

        $this->getJson('/api/settings?fields[settings]=id,key,value,scope,scope_id,updated_by_id,updated_at')
            ->assertOk()
            ->assertJsonPath('data.0.value.name', 'Takussan');
    }

    public function test_regular_agent_cannot_manage_settings(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($agent, 'agent', $agency);

        Sanctum::actingAs($agent);

        $this->postJson('/api/settings', [
            'key' => 'invoice_prefix',
            'value' => ['prefix' => 'INV-'],
            'scope' => SettingScope::Agency->value,
        ])->assertForbidden();
    }
}
