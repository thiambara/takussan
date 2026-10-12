<?php

namespace Tests\Feature\Search;

use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Services\Model\SearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-633 (lot E) — chambres, salles de bain et étage sont des MINIMUMS.
 *
 * Retour du porteur du 2026-10-11 : « 5+ chambres » ne trouvait pas la maison de six chambres.
 * Le panneau affiche « 5+ », l'API comparait par ÉGALITÉ (`bedrooms = 5`). Chaque test porte un
 * bien AU-DESSUS du seuil — c'est lui que l'égalité ratait —, un bien au seuil, un bien
 * en dessous et un bien sans valeur : les deux derniers ne sortent jamais.
 *
 * `featured` est posé à `false` : les places réservées du lot F (ADR-0061 §7) remontent les biens
 * en vedette et ne doivent pas brouiller ces ensembles.
 */
class SearchMinimumFiltersTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_cinq_chambres_et_plus_trouve_la_maison_de_six_chambres(): void
    {
        $six = $this->bien(['type' => 'house', 'bedrooms' => 6]);
        $cinq = $this->bien(['type' => 'house', 'bedrooms' => 5]);
        $this->bien(['type' => 'house', 'bedrooms' => 4]);
        $this->bien(['type' => 'house', 'bedrooms' => null]);
        $this->indexProperties();

        $this->assertSame($this->tries([$six->id, $cinq->id]), $this->ids('bedrooms=5'));
    }

    public function test_trois_salles_de_bain_et_plus_garde_les_biens_qui_en_ont_davantage(): void
    {
        $quatre = $this->bien(['bathrooms' => 4]);
        $trois = $this->bien(['bathrooms' => 3]);
        $this->bien(['bathrooms' => 2]);
        $this->bien(['bathrooms' => null]);
        $this->indexProperties();

        $this->assertSame($this->tries([$quatre->id, $trois->id]), $this->ids('bathrooms=3'));
    }

    public function test_quatrieme_etage_et_plus_trouve_le_septieme_et_jamais_un_etage_inconnu(): void
    {
        $septieme = $this->bien(['floor_number' => 7]);
        $quatrieme = $this->bien(['floor_number' => 4]);
        $this->bien(['floor_number' => 2]);
        $this->bien(['floor_number' => null]);
        $this->indexProperties();

        $this->assertSame($this->tries([$septieme->id, $quatrieme->id]), $this->ids('floor_number=4'));
    }

    public function test_rez_de_chaussee_et_plus_garde_tout_etage_connu(): void
    {
        $rdc = $this->bien(['floor_number' => 0]);
        $deuxieme = $this->bien(['floor_number' => 2]);
        $this->bien(['floor_number' => null]);
        $this->indexProperties();

        $this->assertSame($this->tries([$rdc->id, $deuxieme->id]), $this->ids('floor_number=0'));
    }

    /** `alertMatches()` passe par `buildFilter()` : une alerte « 5+ chambres » capte la maison de six. */
    public function test_une_alerte_cinq_chambres_et_plus_capte_la_maison_de_six(): void
    {
        $six = $this->bien(['bedrooms' => 6, 'published_at' => now()->subHour()]);
        $this->bien(['bedrooms' => 4, 'published_at' => now()->subHour()]);
        $this->indexProperties();

        $search = SavedSearch::factory()->create([
            'user_id' => User::factory()->create()->id,
            'criteria' => ['bedrooms' => 5],
        ]);
        $captes = app(SearchService::class)->getMatchingProperties($search, null, now())['properties']->modelKeys();

        $this->assertSame([$six->id], $captes);
    }

    /** @param  array<string, mixed>  $attributs */
    private function bien(array $attributs): Property
    {
        return Property::factory()->published()->create([
            'featured' => false,
            'published_at' => now()->subHour(),
            ...$attributs,
        ]);
    }

    /** @return list<int> */
    private function ids(string $requete): array
    {
        $reponse = $this->getJson('/api/public/properties/search?per_page=100&'.$requete)->assertOk();

        return $this->tries(array_column($reponse->json('data'), 'id'));
    }

    /**
     * @param  array<int, int|string>  $ids
     * @return list<int>
     */
    private function tries(array $ids): array
    {
        $ids = array_values(array_map('intval', $ids));
        sort($ids);

        return $ids;
    }
}
