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
 * TCK-280 — `filter[search]` on the dashboard property listing is routed
 * through Scout/Meilisearch while staying agency-scoped.
 */
class PropertyDashboardSearchTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_dashboard_search_is_typo_tolerant(): void
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
}
