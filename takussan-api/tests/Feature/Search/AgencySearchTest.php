<?php

namespace Tests\Feature\Search;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

class AgencySearchTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_agency_search_is_typo_tolerant_for_super_admin(): void
    {
        $this->actingAsRole('super_admin');

        Agency::factory()->create(['name' => 'Immobiliere Teranga']);
        $this->indexSearchable(Agency::class);

        $this->getJson('/api/agencies?filter[search]=Terenga')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    /**
     * AC1 — les trois agences sont créées dans l'ordre INVERSE de leur
     * pertinence : le `defaultSort('-created_at')` du contrôleur rendrait
     * l'ordre opposé.
     */
    public function test_agency_search_ranks_by_relevance_not_by_date(): void
    {
        $this->actingAsRole('super_admin');

        $exact = Agency::factory()->create(['name' => 'Ndiayefall', 'created_at' => now()->subDays(3)]);
        $oneTypo = Agency::factory()->create(['name' => 'Ndiayefalt', 'created_at' => now()->subDays(2)]);
        $twoTypos = Agency::factory()->create(['name' => 'Ndiayefaxt', 'created_at' => now()->subDay()]);
        $this->indexSearchable(Agency::class);

        $ids = $this->getJson('/api/agencies?filter[search]=Ndiayefall&fields[agencies]=id,name')
            ->assertOk()
            ->assertJsonPath('meta.total', 3)
            ->json('data.*.id');

        $this->assertSame([$exact->id, $oneTypo->id, $twoTypos->id], $ids);
    }

    public function test_agency_search_is_bounded_to_visible_agencies(): void
    {
        $agencyA = Agency::factory()->create(['name' => 'Cabinet Searchunique']);
        Agency::factory()->create(['name' => 'Bureau Searchunique']);
        $this->actingAsRole('agent', ['agency' => $agencyA]);

        $this->indexSearchable(Agency::class);

        $response = $this->getJson('/api/agencies?filter[search]=Searchunique')->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_soft_deleted_agency_is_not_searchable(): void
    {
        $this->actingAsRole('super_admin');

        $agency = Agency::factory()->create(['name' => 'Agence Fantomatique']);
        $agency->delete();
        $this->indexSearchable(Agency::class);

        $this->getJson('/api/agencies?filter[search]=Fantomatique')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);
    }
}
