<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-2607 — « Voir les N biens » ouvre la liste filtrée sur PLUSIEURS quartiers : `locations`,
 * liste à virgules (ou tableau), OU entre les quartiers, chacun résolu comme `location` —
 * l'identifiant du référentiel pour une adresse rattachée, la clé repliée de son texte sinon.
 *
 * La liste (Meilisearch, `buildFilter()`) et la carte (PostgreSQL, `FiltresDeLaCarte`) sont deux
 * traductions du même vocabulaire : chaque assertion porte sur les deux.
 */
class PublicSearchLocationsTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const CADRAGE = '14.0,-18.0,15.5,-16.5';

    /** AC2 — `locations=Mermoz,Ngor` rend exactement l'union de `location=Mermoz` et `location=Ngor`. */
    public function test_plusieurs_quartiers_rendent_l_union_de_chacun(): void
    {
        $ville = GeoCity::factory()->create(['name' => 'Pikine', 'slug' => 'pikine']);
        $referentiel = GeoNeighborhood::factory()->create(['geo_city_id' => $ville->id, 'name' => 'Mermoz', 'slug' => 'mermoz']);
        // Rattaché : seul l'identifiant dit où est le bien (texte resté en arrière, P17.03).
        $mermozRattache = $this->bien('Pikine', null, $referentiel->id);
        DB::table('addresses')->where('addressable_id', $mermozRattache->id)->update(['neighborhood' => 'Ancien nom']);
        // Texte libre, sans identifiant, écrit autrement que la saisie.
        $mermozLibre = $this->bien('Rufisque', 'MERMOZ');
        $ngorLibre = $this->bien('Dakar', 'Ngor');
        $medina = $this->bien('Dakar', 'Médina');
        $this->indexProperties();

        foreach (['liste', 'carte'] as $cote) {
            $mermoz = $this->ids($cote, ['location' => 'Mermoz']);
            $ngor = $this->ids($cote, ['location' => 'Ngor']);
            $this->assertSame($this->tries([$mermozRattache->id, $mermozLibre->id]), $mermoz, "{$cote} : Mermoz seul");
            $this->assertSame([$ngorLibre->id], $ngor, "{$cote} : Ngor seul");

            $union = $this->tries(array_unique([...$mermoz, ...$ngor]));
            $this->assertCount(3, $union);
            $this->assertSame($union, $this->ids($cote, ['locations' => 'Mermoz,Ngor']), "{$cote} : la liste à virgules");
            $this->assertSame($union, $this->ids($cote, ['locations' => ['Mermoz', 'Ngor']]), "{$cote} : la forme tableau");
            $this->assertNotContains($medina->id, $this->ids($cote, ['locations' => 'Mermoz,Ngor']));

            // Témoin : un seul quartier listé se lit comme `location`.
            $this->assertSame($ngor, $this->ids($cote, ['locations' => 'Ngor']), "{$cote} : un seul quartier listé");
        }
    }

    /** Les autres filtres restent un ET avec la liste de quartiers. */
    public function test_la_liste_de_quartiers_se_combine_aux_autres_filtres(): void
    {
        $ngorVente = $this->bien('Dakar', 'Ngor', null, ['contract_type' => 'sale', 'rent_period' => null]);
        $this->bien('Dakar', 'Ngor', null, ['contract_type' => 'rent', 'rent_period' => 'monthly']);
        $yoffVente = $this->bien('Dakar', 'Yoff', null, ['contract_type' => 'sale', 'rent_period' => null]);
        // Témoin : en vente aussi, hors des quartiers listés — seule la liste l'écarte.
        $this->bien('Dakar', 'Médina', null, ['contract_type' => 'sale', 'rent_period' => null]);
        $this->indexProperties();

        foreach (['liste', 'carte'] as $cote) {
            $this->assertSame(
                $this->tries([$ngorVente->id, $yoffVente->id]),
                $this->ids($cote, ['locations' => 'Ngor,Yoff', 'contract_type' => 'sale']),
                $cote,
            );
        }

        // La facette des quartiers se compte sans la liste de quartiers, comme sans `location` :
        // elle propose aussi Médina, qu'on pourrait ajouter.
        $facette = $this->getJson('/api/public/properties/search?locations=Ngor,Yoff&contract_type=sale&facets=neighborhood')
            ->assertOk()->json('meta.facets.neighborhood');
        $this->assertEqualsCanonicalizing(['Ngor', 'Yoff', 'Médina'], array_column($facette, 'value'));
    }

    public function test_les_bornes_de_l_url(): void
    {
        $douze = implode(',', array_map(fn (int $i) => "Q{$i}", range(1, 12)));

        $this->getJson('/api/public/properties/search?'.http_build_query(['locations' => $douze.',Q13']))
            ->assertUnprocessable()->assertJsonValidationErrors('locations');
        $this->getJson('/api/public/properties/search?'.http_build_query(['locations' => 'Mermoz,'.str_repeat('a', 101)]))
            ->assertUnprocessable()->assertJsonValidationErrors('locations');
        $this->getJson('/api/public/properties/search?'.http_build_query(['locations' => $douze]))->assertOk();
        // Segments vides retirés, comme `cities`.
        $this->getJson('/api/public/properties/search?locations=,Mermoz,,')->assertOk();
    }

    /**
     * @param  array<string, mixed>  $criteres
     * @return list<int>
     */
    private function ids(string $cote, array $criteres): array
    {
        if ($cote === 'liste') {
            $reponse = $this->getJson('/api/public/properties/search?'.http_build_query([...$criteres, 'per_page' => 100]))->assertOk();

            return $this->tries(array_unique([
                ...array_column($reponse->json('data') ?? [], 'id'),
                ...array_column($reponse->json('sponsored') ?? [], 'id'),
            ]));
        }
        $reponse = $this->getJson('/api/public/properties/map?'.http_build_query(['bounds' => self::CADRAGE, ...$criteres]))->assertOk();

        return $this->tries(array_map(static fn (array $f) => (int) $f['properties']['id'], $reponse->json('features')));
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

    /** @param  array<string, mixed>  $bien */
    private function bien(string $ville, ?string $quartier, ?int $quartierId = null, array $bien = []): Property
    {
        $propriete = Property::factory()->published()->create(['featured' => false, 'published_at' => now()->subHour(), ...$bien]);
        Address::create(array_filter([
            'addressable_type' => Property::class,
            'addressable_id' => $propriete->id,
            'country' => 'SN',
            'city' => $ville,
            'neighborhood' => $quartier,
            'geo_neighborhood_id' => $quartierId,
            'latitude' => 14.7,
            'longitude' => -17.45,
        ], static fn ($valeur) => $valeur !== null));

        return $propriete->fresh();
    }
}
