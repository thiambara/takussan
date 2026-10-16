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

    /**
     * TCK-662 (P01.01) — sans `sort=`, une recherche de `/app` est classée par pertinence.
     *
     * Les trois biens sont créés dans l'ordre INVERSE de leur pertinence : le tri par date
     * (`-created_at`) rendrait 2-fautes, 1-faute, exact.
     */
    public function test_dashboard_search_ranks_by_relevance_not_by_date(): void
    {
        [$agent, $exact, $oneTypo, $twoTypos] = $this->troisBiensDePertinenceDecroissante();

        Sanctum::actingAs($agent);

        $ids = $this->getJson('/api/properties?filter[search]=Ndiayefall&fields[properties]=id,title')
            ->assertOk()
            ->assertJsonPath('meta.total', 3)
            ->json('data.*.id');

        $this->assertSame([$exact->id, $oneTypo->id, $twoTypos->id], $ids);
    }

    /**
     * TCK-662 — un `sort=` explicite reste souverain : la pertinence n'est qu'un tri par défaut.
     */
    public function test_explicit_sort_wins_over_relevance(): void
    {
        [$agent, $exact, $oneTypo, $twoTypos] = $this->troisBiensDePertinenceDecroissante();

        Sanctum::actingAs($agent);

        $ids = $this->getJson('/api/properties?filter[search]=Ndiayefall&sort=-created_at&fields[properties]=id,title,created_at')
            ->assertOk()
            ->json('data.*.id');

        $this->assertSame([$twoTypos->id, $oneTypo->id, $exact->id], $ids);
    }

    /** @return array{0: User, 1: Property, 2: Property, 3: Property} */
    private function troisBiensDePertinenceDecroissante(): array
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $bien = fn (string $titre, int $jours) => Property::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agency->id,
            'title' => $titre,
            'created_at' => now()->subDays($jours),
        ]);

        $exact = $bien('Villa Ndiayefall', 3);
        $oneTypo = $bien('Villa Ndiayefalt', 2);
        $twoTypos = $bien('Villa Ndiayefaxt', 1);
        $this->indexProperties();

        return [$agent, $exact, $oneTypo, $twoTypos];
    }
}
