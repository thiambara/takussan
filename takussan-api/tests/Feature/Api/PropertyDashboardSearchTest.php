<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-280 — `filter[search]` on the dashboard property listing stays agency-scoped.
 * TCK-578 — it no longer goes through Scout/Meilisearch: the property index is public-only.
 */
class PropertyDashboardSearchTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /**
     * TCK-578 (ADR-0008, amendement du 2026-11-16) — la recherche des consoles passe par la base,
     * pour trouver les biens que l'index PUBLIC ne contient pas. Le prix, assumé : plus de tolérance
     * aux fautes. Ce test l'épingle, pour qu'un retour au moteur se décide et ne se glisse pas.
     */
    public function test_dashboard_search_is_strict_by_decision(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $property = Property::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'title' => 'Grand appartement Plateau',
        ]);
        $this->indexProperties();

        Sanctum::actingAs($agent);

        $this->getJson('/api/properties?filter[search]=appartemnt')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
        $this->getJson('/api/properties?filter[search]=APPARTEMENT')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $property->id);
    }

    public function test_dashboard_search_stays_scoped_to_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $agentA = User::factory()->withAgentProfile($agencyA)->create();

        $mine = Property::factory()->create([
            'user_id' => $agentA->id,
            'agency_id' => $agencyA->id,
            'title' => 'Appartement de mon agence',
        ]);
        Property::factory()->create([
            'agency_id' => $agencyB->id,
            'title' => 'Appartement agence concurrente',
        ]);
        $this->indexProperties();

        Sanctum::actingAs($agentA);

        $this->getJson('/api/properties?filter[search]=appartement')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $mine->id);
    }

    // TCK-662 — le classement par pertinence du moteur n'a plus cours sur cette liste (TCK-578) :
    // la référence exacte en tête et la souveraineté de `sort=` sont épinglées par
    // `Tests\Feature\Search\RechercheConsoleDesBiensTest::test_la_reference_exacte_vient_en_tete`.
}
