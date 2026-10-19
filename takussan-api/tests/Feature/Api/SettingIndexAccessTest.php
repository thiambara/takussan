<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\SettingScope;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-965 (P47.05) — `GET /api/settings` rendait à tout membre d'une agence, agent ou bailleur
 * compris, ses lignes d'agence ET toutes les lignes `global` du catalogue, publiques ou non. Hors
 * super-admin, la liste est réservée à l'admin de l'agence, qui n'y lit que les lignes de son
 * agence ; les réglages publics passent par `GET /api/settings/public`.
 */
class SettingIndexAccessTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $autre = Agency::factory()->create();

        Setting::query()->create(['key' => 'boost.sponsored_slots_per_page', 'value' => 3, 'scope' => SettingScope::Global]);
        Setting::query()->create(['key' => 'invoice_prefix', 'value' => ['prefix' => 'INV-'], 'scope' => SettingScope::Agency, 'scope_id' => $this->agency->id]);
        Setting::query()->create(['key' => 'invoice_prefix', 'value' => ['prefix' => 'AUT-'], 'scope' => SettingScope::Agency, 'scope_id' => $autre->id]);
    }

    private function membre(string $role): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, $role, $this->agency);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_un_agent_est_refuse(): void
    {
        $this->membre('agent');

        $this->getJson('/api/settings')->assertForbidden();
    }

    public function test_un_bailleur_est_refuse(): void
    {
        $this->membre('owner');

        $this->getJson('/api/settings')->assertForbidden();
    }

    public function test_l_admin_d_agence_ne_lit_que_les_lignes_de_son_agence(): void
    {
        $this->membre('agency_admin');

        $lignes = $this->getJson('/api/settings')->assertOk()->json('data');

        $this->assertCount(1, $lignes);
        $this->assertSame('agency', $lignes[0]['scope']);
        $this->assertSame($this->agency->id, $lignes[0]['scope_id']);
        $this->assertSame([], array_values(array_filter($lignes, fn (array $l) => $l['scope'] === 'global')));
    }

    public function test_le_super_admin_lit_toutes_les_lignes(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/settings')->assertOk()->assertJsonCount(3, 'data');
    }
}
