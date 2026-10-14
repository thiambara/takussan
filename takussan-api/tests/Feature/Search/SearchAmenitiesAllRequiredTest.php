<?php

namespace Tests\Feature\Search;

use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\Tag;
use App\Models\User;
use App\Services\Model\SearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-633 (lot E) — décision 4 du porteur (plan maître, 2026-10-12) : le filtre des équipements
 * est un **ET**. « Piscine, Parking » rend les biens qui offrent les DEUX, plus ceux qui n'en
 * offrent qu'un : celui qui coche deux équipements les veut tous les deux.
 *
 * Avant ce lot, `buildFilter()` les joignait en OU (tableau imbriqué) : plus on cochait, plus la
 * liste s'allongeait — l'inverse de ce qu'un filtre promet. Les alertes passent par le même
 * `buildFilter()` et suivent.
 */
class SearchAmenitiesAllRequiredTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_deux_equipements_coches_ne_rendent_que_les_biens_qui_offrent_les_deux(): void
    {
        $lesDeux = $this->bien(['Piscine', 'Parking']);
        $this->bien(['Piscine']);
        $this->bien(['Parking']);
        $this->bien([]);
        $this->indexProperties();

        $this->assertSame([$lesDeux->id], $this->ids('tags=Piscine,Parking'));
    }

    public function test_un_seul_equipement_garde_tous_les_biens_qui_l_offrent(): void
    {
        $lesDeux = $this->bien(['Piscine', 'Parking']);
        $piscine = $this->bien(['Piscine']);
        $this->bien(['Parking']);
        $this->indexProperties();

        $this->assertSame($this->tries([$lesDeux->id, $piscine->id]), $this->ids('tags=Piscine'));
    }

    public function test_une_alerte_a_deux_equipements_ne_capte_que_le_bien_qui_offre_les_deux(): void
    {
        $lesDeux = $this->bien(['Piscine', 'Parking']);
        $this->bien(['Piscine']);
        $this->indexProperties();

        $search = SavedSearch::factory()->create([
            'user_id' => User::factory()->create()->id,
            'criteria' => ['tags' => 'Piscine,Parking'],
        ]);
        $captes = app(SearchService::class)->getMatchingProperties($search, null, now())['properties']->modelKeys();

        $this->assertSame([$lesDeux->id], $captes);
    }

    /** @param  list<string>  $equipements */
    private function bien(array $equipements): Property
    {
        $bien = Property::factory()->published()->create([
            'featured' => false,
            'published_at' => now()->subHour(),
        ]);
        foreach ($equipements as $nom) {
            $tag = Tag::query()->where('name', $nom)->first()
                ?? Tag::factory()->create(['name' => $nom, 'type' => TagType::Amenity]);
            $bien->tags()->attach($tag);
        }

        return $bien;
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
