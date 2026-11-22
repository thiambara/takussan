<?php

namespace Tests\Feature\Api\Me;

use App\Http\Resources\Api\Me\ProfileResource;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\GeoNeighborhood;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2524 — l'écran de profil de la console RELIT ce que l'agent a dit à l'annuaire.
 *
 * `PATCH /api/me/agent-profiles/{id}/directory` (TCK-2518) écrit les langues et les quartiers, mais
 * aucune lecture authentifiée ne les rendait : `GET /api/me/profiles` n'émettait que la licence et la
 * spécialité (relevé du 2026-11-09, `agent1@dakarimmo.sn` → 200 sans ces clés ; `GET …/directory` →
 * 405). Le formulaire aurait ouvert vide, et un enregistrement aurait effacé ce qui était posé.
 */
class ProfilAgentAnnuaireTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_profil_d_agent_porte_ses_langues_et_ses_quartiers_nommes_dans_l_ordre_choisi(): void
    {
        $user = User::factory()->create();
        $agence = Agency::factory()->create();
        // Créés dans l'ordre INVERSE du choix : l'ordre choisi [Ngor, Almadies] n'est ni celui des ids, ni
        // celui des noms — un nommage dans l'ordre de la base (ou alphabétique) rougit ici.
        $almadies = GeoNeighborhood::factory()->create(['name' => 'Almadies']);
        $ngor = GeoNeighborhood::factory()->create(['name' => 'Ngor']);
        $this->assertGreaterThan($almadies->id, $ngor->id);
        $agent = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agence->id,
            'languages' => ['wo', 'fr'],
            'neighborhood_ids' => [$ngor->id, $almadies->id],
        ]);
        $proprio = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);

        Sanctum::actingAs($user);
        $data = collect($this->getJson('/api/me/profiles')->assertOk()->json('data'))->keyBy('id');

        $profil = $data["agent:{$agent->id}"];
        $this->assertSame(['wo', 'fr'], $profil['languages']);
        $this->assertSame([$ngor->id, $almadies->id], $profil['neighborhood_ids']);
        $this->assertSame(
            [['id' => $ngor->id, 'name' => 'Ngor'], ['id' => $almadies->id, 'name' => 'Almadies']],
            $profil['neighborhoods'],
        );
        $this->assertArrayNotHasKey('languages', $data["owner:{$proprio->id}"]);
        $this->assertArrayNotHasKey('neighborhoods', $data["owner:{$proprio->id}"]);
    }

    public function test_un_profil_sans_annuaire_rend_des_listes_vides_et_un_quartier_disparu_est_saute(): void
    {
        $user = User::factory()->create();
        $quartier = GeoNeighborhood::factory()->create(['name' => 'Mermoz']);
        $vide = AgentProfile::factory()->create(['user_id' => $user->id, 'languages' => null, 'neighborhood_ids' => null]);
        $autre = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => Agency::factory()->create()->id,
            'neighborhood_ids' => [$quartier->id, 999_999],
        ]);

        Sanctum::actingAs($user);
        $data = collect($this->getJson('/api/me/profiles')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame([], $data["agent:{$vide->id}"]['languages']);
        $this->assertSame([], $data["agent:{$vide->id}"]['neighborhood_ids']);
        $this->assertSame([], $data["agent:{$vide->id}"]['neighborhoods']);
        // Le quartier qui n'existe plus n'a pas de nom à montrer : il n'est pas émis, et l'id brut non plus
        // — l'écran renverrait sinon un id que la validation (`exists`) refuserait à l'enregistrement.
        $this->assertSame([$quartier->id], $data["agent:{$autre->id}"]['neighborhood_ids']);
        $this->assertSame([['id' => $quartier->id, 'name' => 'Mermoz']], $data["agent:{$autre->id}"]['neighborhoods']);
    }

    /**
     * Revue de TCK-2524 — la puce « Voir ma fiche publique » de l'agent : le slug de SA fiche, émis
     * seulement quand la page publique existe (la résolution même de `/agents/{slug}`).
     */
    public function test_le_profil_d_agent_porte_le_slug_de_sa_fiche_publique(): void
    {
        $user = User::factory()->create(['public_slug' => 'awa-diop']);
        $agent = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => Agency::factory()->create()->id]);

        Sanctum::actingAs($user);
        $data = collect($this->getJson('/api/me/profiles')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame('awa-diop', $data["agent:{$agent->id}"]['public_slug']);
        $this->getJson('/api/public/agents/awa-diop')->assertOk();
    }

    public function test_sans_fiche_publique_le_slug_est_nul(): void
    {
        // Agent d'une agence suspendue : la fiche publique rend 404 (`AgentPublic::sansAgenceHorsLigne`).
        $suspendu = User::factory()->create(['public_slug' => 'moussa-fall']);
        $profilSuspendu = AgentProfile::factory()->create([
            'user_id' => $suspendu->id,
            'agency_id' => Agency::factory()->create(['status' => AgencyStatus::Suspended])->id,
        ]);
        Sanctum::actingAs($suspendu);
        $this->assertNull(collect($this->getJson('/api/me/profiles')->assertOk()->json('data'))
            ->keyBy('id')["agent:{$profilSuspendu->id}"]['public_slug']);
        $this->getJson('/api/public/agents/moussa-fall')->assertNotFound();

        // Profil d'agent inactif, ni annonce publique ni annuaire choisi : pas de fiche. `GET /api/me/profiles`
        // ne liste pas un profil inactif ; la ressource est donc jugée directement, pour son propriétaire.
        $inactif = User::factory()->create(['public_slug' => 'fatou-sow', 'listed_in_public_directory' => false]);
        $profilInactif = AgentProfile::factory()->inactive()->create([
            'user_id' => $inactif->id,
            'agency_id' => Agency::factory()->create()->id,
        ]);
        $requete = Request::create('/api/me/profiles');
        $requete->setUserResolver(fn () => $inactif);
        $this->assertNull((new ProfileResource($profilInactif))->toArray($requete)['public_slug']);
        $this->getJson('/api/public/agents/fatou-sow')->assertNotFound();
    }

    public function test_le_slug_n_est_emis_que_pour_le_profil_de_l_appelant(): void
    {
        $agent = User::factory()->create(['public_slug' => 'awa-diop']);
        $profil = AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => Agency::factory()->create()->id]);
        $autre = User::factory()->create();

        $requete = Request::create('/api/me/profiles');
        $requete->setUserResolver(fn () => $autre);
        $this->assertNull((new ProfileResource($profil))->toArray($requete)['public_slug']);

        $requete->setUserResolver(fn () => $agent);
        $this->assertSame('awa-diop', (new ProfileResource($profil))->toArray($requete)['public_slug']);
    }
}
