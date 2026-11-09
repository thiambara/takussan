<?php

namespace Tests\Feature\Search;

use App\Models\Property;
use App\Models\SearchQueryStat;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2496 — `published_after` : la liste publique ne rend que les biens publiés après l'instant donné. Le front compte
 * ainsi les biens nouveaux d'une recherche récente (`per_page=1`, `meta.total`).
 */
class PublicPropertyPublishedAfterTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private string $url = '/api/public/properties/search';

    /** AC4 — exclut un bien publié la veille de la date, garde un bien publié après. */
    public function test_ac4_les_biens_publies_apres_la_date_seulement(): void
    {
        $veille = Property::factory()->published()->create(['published_at' => Carbon::parse('2026-11-01 10:00:00')]);
        $apres = Property::factory()->published()->create(['published_at' => Carbon::parse('2026-11-03 09:00:00')]);
        $this->indexProperties();

        $ids = array_column($this->getJson($this->url.'?published_after='.rawurlencode('2026-11-02T08:00:00+00:00'))->assertOk()->json('data'), 'id');

        $this->assertSame([$apres->id], $ids);
        $this->assertNotContains($veille->id, $ids);
        $this->assertSame(1, $this->getJson($this->url.'?per_page=1&published_after=2026-11-02')->json('meta.total'));
        $this->assertSame(2, $this->getJson($this->url)->json('meta.total'));
    }

    /** Strictement postérieur : un bien publié À l'instant donné n'est pas « nouveau » ; une seconde avant, il l'est. */
    public function test_published_after_est_strict(): void
    {
        Property::factory()->published()->create(['published_at' => Carbon::parse('2026-11-02 08:00:00')]);
        $this->indexProperties();

        $this->assertSame(0, $this->getJson($this->url.'?placements=false&published_after='.rawurlencode('2026-11-02T08:00:00+00:00'))->assertOk()->json('meta.total'));
        $this->assertSame(1, $this->getJson($this->url.'?placements=false&published_after='.rawurlencode('2026-11-02T07:59:59+00:00'))->assertOk()->json('meta.total'));
    }

    /**
     * Revue de TCK-2496 — le compte des nouveaux n'emprunte JAMAIS le repli élargi d'ADR-0024 : sous un mot-clé de deux
     * termes qu'aucun bien nouveau ne porte tous deux, il vaut 0 — ce que montrera la liste stricte rouverte — et non le
     * nombre de nouveaux qui n'en portent qu'un.
     */
    public function test_le_compte_des_nouveaux_n_elargit_jamais(): void
    {
        Property::factory()->published()->create(['title' => 'Villa avec piscine', 'description' => 'Villa avec piscine', 'published_at' => Carbon::parse('2026-10-01 10:00:00')]);
        Property::factory()->published()->create(['title' => 'Villa vue sur mer', 'description' => 'Villa vue sur mer', 'published_at' => Carbon::parse('2026-11-05 10:00:00')]);
        $this->indexProperties();
        $q = rawurlencode('villa piscine');

        $this->assertSame(1, $this->getJson($this->url.'?placements=false&q='.$q)->assertOk()->json('meta.total'), 'témoin : la liste est stricte');
        $sansAncien = $this->getJson($this->url.'?placements=false&q='.$q.'&published_after='.rawurlencode('2026-11-01T00:00:00+00:00').'&per_page=1')->assertOk();

        $this->assertSame(0, $sansAncien->json('meta.total'));
        $this->assertNotSame('widened', $sansAncien->json('search.strategy'));
    }

    public function test_une_date_future_ou_illisible_rend_422(): void
    {
        $this->getJson($this->url.'?published_after='.rawurlencode(now()->addDay()->toIso8601String()))->assertStatus(422);
        $this->getJson($this->url.'?published_after=hier')->assertStatus(422);
    }

    /** Un compte de biens nouveaux n'est pas une recherche : le journal (ADR-0088) n'en garde rien. */
    public function test_le_compte_des_nouveaux_n_est_pas_journalise(): void
    {
        Property::factory()->published()->create(['type' => 'villa']);
        $this->indexProperties();

        $this->getJson($this->url.'?type=villa&published_after=2026-01-01')->assertOk();
        $this->assertSame(0, SearchQueryStat::query()->count());

        $this->getJson($this->url.'?type=villa')->assertOk();
        $this->assertSame(1, SearchQueryStat::query()->count());
    }
}
