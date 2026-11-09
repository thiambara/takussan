<?php

namespace Tests\Feature\Directory;

use App\Models\Agency;
use App\Models\GeoNeighborhood;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-2518 — l'écriture de la vitrine : l'agence pose son accroche, ses trois points et sa
 * sélection (`PATCH /api/agencies/{id}`) ; l'agent pose ses langues et ses quartiers
 * (`PATCH /api/me/agent-profiles/{id}/directory`).
 */
class DirectoryVitrineWriteTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_l_admin_pose_l_accroche_les_trois_points_et_la_selection(): void
    {
        $agence = Agency::factory()->create();
        $biens = Property::factory()->count(2)->create(['agency_id' => $agence->id]);
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $this->patchJson("/api/agencies/{$agence->id}", [
            'tagline' => 'On loue et on vend à Dakar depuis 2014.',
            'highlights' => ['Une équipe qui parle wolof', 'Visites le samedi', 'Baux signés en ligne'],
            'showcase_property_ids' => [$biens[1]->id, $biens[0]->id],
        ])->assertOk()
            ->assertJsonPath('data.tagline', 'On loue et on vend à Dakar depuis 2014.')
            ->assertJsonPath('data.showcase_property_ids', [$biens[1]->id, $biens[0]->id]);

        $agence->refresh();
        $this->assertSame([$biens[1]->id, $biens[0]->id], $agence->showcase_property_ids);
        $this->assertCount(3, $agence->highlights);
    }

    /** AC2 — le bien d'une autre agence : 422, et RIEN n'est écrit, ni la sélection ni le reste. */
    public function test_ac2_un_bien_d_une_autre_agence_dans_la_selection_rend_422_sans_rien_ecrire(): void
    {
        $agence = Agency::factory()->create(['tagline' => 'Avant']);
        $sien = Property::factory()->create(['agency_id' => $agence->id]);
        $autre = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $this->patchJson("/api/agencies/{$agence->id}", [
            'tagline' => 'Après',
            'showcase_property_ids' => [$sien->id, $autre->id],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('showcase_property_ids.1');

        $agence->refresh();
        $this->assertSame('Avant', $agence->tagline);
        $this->assertNull($agence->showcase_property_ids);
    }

    public function test_plus_de_six_biens_ou_plus_de_trois_points_rendent_422(): void
    {
        $agence = Agency::factory()->create();
        $biens = Property::factory()->count(7)->create(['agency_id' => $agence->id]);
        $this->apiActingAsRole('agency_admin', ['agency' => $agence]);

        $this->patchJson("/api/agencies/{$agence->id}", ['showcase_property_ids' => $biens->pluck('id')->all()])
            ->assertUnprocessable()->assertJsonValidationErrors('showcase_property_ids');
        $this->patchJson("/api/agencies/{$agence->id}", ['highlights' => ['a', 'b', 'c', 'd']])
            ->assertUnprocessable()->assertJsonValidationErrors('highlights');
        $this->patchJson("/api/agencies/{$agence->id}", ['highlights' => [str_repeat('x', 81)]])
            ->assertUnprocessable()->assertJsonValidationErrors('highlights.0');
        $this->patchJson("/api/agencies/{$agence->id}", ['tagline' => str_repeat('x', 121)])
            ->assertUnprocessable()->assertJsonValidationErrors('tagline');
    }

    public function test_l_agent_pose_ses_langues_et_ses_quartiers_sur_son_propre_profil(): void
    {
        $agent = User::factory()->create();
        $profil = AgentProfile::factory()->create(['user_id' => $agent->id]);
        $quartiers = GeoNeighborhood::factory()->count(2)->create();
        Sanctum::actingAs($agent);

        $this->patchJson("/api/me/agent-profiles/{$profil->id}/directory", [
            'languages' => ['fr', 'wo'],
            'neighborhood_ids' => [$quartiers[1]->id, $quartiers[0]->id],
        ])->assertOk()
            ->assertJsonPath('data.languages', ['fr', 'wo'])
            ->assertJsonPath('data.neighborhood_ids', [$quartiers[1]->id, $quartiers[0]->id]);

        $this->patchJson("/api/me/agent-profiles/{$profil->id}/directory", ['languages' => []])->assertOk();
        $profil->refresh();
        $this->assertNull($profil->languages, '`[]` vide la liste');
        $this->assertSame([$quartiers[1]->id, $quartiers[0]->id], $profil->neighborhood_ids, 'clé absente : inchangée');
    }

    public function test_une_langue_hors_liste_un_quartier_inconnu_ou_six_quartiers_rendent_422(): void
    {
        $agent = User::factory()->create();
        $profil = AgentProfile::factory()->create(['user_id' => $agent->id]);
        $quartiers = GeoNeighborhood::factory()->count(6)->create();
        Sanctum::actingAs($agent);

        $this->patchJson("/api/me/agent-profiles/{$profil->id}/directory", ['languages' => ['klingon']])
            ->assertUnprocessable()->assertJsonValidationErrors('languages.0');
        $this->patchJson("/api/me/agent-profiles/{$profil->id}/directory", ['neighborhood_ids' => [999999999]])
            ->assertUnprocessable()->assertJsonValidationErrors('neighborhood_ids.0');
        $this->patchJson("/api/me/agent-profiles/{$profil->id}/directory", ['neighborhood_ids' => $quartiers->pluck('id')->all()])
            ->assertUnprocessable()->assertJsonValidationErrors('neighborhood_ids');
    }

    public function test_un_autre_compte_ne_touche_pas_au_profil_et_l_apprend_avant_la_validation(): void
    {
        $profil = AgentProfile::factory()->create(['user_id' => User::factory()->create()->id]);
        Sanctum::actingAs(User::factory()->create());

        $this->patchJson("/api/me/agent-profiles/{$profil->id}/directory", ['languages' => ['klingon']])
            ->assertForbidden();
    }
}
