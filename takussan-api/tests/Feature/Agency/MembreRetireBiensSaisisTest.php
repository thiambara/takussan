<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-1705 (P153.01) — sur un bien d'agence, `properties.user_id` ne vaut titre que pour qui a
 * encore un profil dans l'agence du bien. L'agent qui a saisi le bien, puis a été retiré en
 * `leave_unassigned`, ne le lit plus, ne le modifie plus et ne le voit plus dans sa liste. L'auteur
 * d'un bien sans agence garde le sien.
 */
class MembreRetireBiensSaisisTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return array{agency: Agency, agent: User, admin: User, bien: Property} */
    private function scenario(): array
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $agent = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);
        $bien = Property::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id, 'title' => 'Saisi par l agent']);

        return compact('agency', 'agent', 'admin', 'bien');
    }

    public function test_l_agent_retire_ne_lit_ni_ne_modifie_le_bien_qu_il_a_saisi(): void
    {
        ['agency' => $agency, 'agent' => $agent, 'admin' => $admin, 'bien' => $bien] = $this->scenario();
        app(AgencyMemberRemovalService::class)->remove($agency, $agent->fresh(), $admin, leaveUnassigned: true);

        Sanctum::actingAs($agent->fresh());
        $this->getJson("/api/properties/{$bien->id}")->assertForbidden();
        $this->putJson("/api/properties/{$bien->id}", ['title' => 'Repris par le retiré'])->assertForbidden();
        $this->assertSame('Saisi par l agent', $bien->fresh()->title);

        $ids = collect($this->getJson('/api/properties')->assertOk()->json('data'))->pluck('id');
        $this->assertNotContains($bien->id, $ids);
    }

    /** Témoin : tant qu'il est de l'agence, l'agent lit et liste le bien qu'il a saisi. */
    public function test_l_agent_encore_membre_lit_et_liste_le_bien_qu_il_a_saisi(): void
    {
        ['agent' => $agent, 'bien' => $bien] = $this->scenario();

        Sanctum::actingAs($agent);
        $this->getJson("/api/properties/{$bien->id}")->assertOk();
        $ids = collect($this->getJson('/api/properties')->assertOk()->json('data'))->pluck('id');
        $this->assertContains($bien->id, $ids);
    }

    /** Le cas que la règle garde : l'auteur d'un bien sans agence, sans aucun profil. */
    public function test_l_auteur_d_un_bien_sans_agence_garde_son_bien(): void
    {
        $auteur = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $auteur->id, 'agency_id' => null]);

        Sanctum::actingAs($auteur);
        $this->getJson("/api/properties/{$bien->id}")->assertOk();
        $this->assertTrue($auteur->can('update', $bien));
        $ids = collect($this->getJson('/api/properties')->assertOk()->json('data'))->pluck('id');
        $this->assertContains($bien->id, $ids);
    }
}
