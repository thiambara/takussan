<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\User;
use App\Services\Geo\GeoNeighborhoodModeration;
use App\Services\Search\PropertySearchService;
use App\Support\SavedSearchCriteria;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-663 (piste P01.02) — le quartier que propose le panneau trouve les biens de ce quartier.
 *
 * Le panneau propose les noms du référentiel (« Grand Yoff ») ; les adresses non rattachées portent
 * un texte libre (« Grand-Yoff », « Guediawaye »). Le filtre comparait les deux par égalité stricte :
 * 0 bien. Décision du porteur : filtrer par `geo_neighborhood_id` quand l'adresse en porte un, sinon
 * par le nom normalisé sans accent ni tiret, sans réécrire les adresses.
 *
 * La liste (Meilisearch) et la carte (PostgreSQL) sont deux traductions du même filtre
 * (`MapFiltersParityTest`) : chaque cas est éprouvé des deux côtés.
 */
class QuartierDuPanneauTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const CADRAGE = '14.0,-18.0,15.5,-16.5';

    public function test_un_tiret_ou_un_accent_ne_separe_plus_le_nom_du_referentiel_du_texte_libre(): void
    {
        // Une ville hors référentiel : les adresses gardent leur texte, sans identifiant.
        $tiret = $this->bien('Rufisque', 'Grand-Yoff');
        $accent = $this->bien('Rufisque', 'Guédiawaye');
        $temoin = $this->bien('Rufisque', 'Almadies');
        $this->indexProperties();

        $this->assertDeuxCotes([$tiret->id], ['location' => 'Grand Yoff']);
        $this->assertDeuxCotes([$accent->id], ['location' => 'Guediawaye']);
        $this->assertDeuxCotes([$accent->id], ['location' => 'GUÉDIAWAYE']);
        $this->assertDeuxCotes([$temoin->id], ['location' => 'Almadies']);
    }

    public function test_une_adresse_rattachee_se_trouve_par_son_identifiant_et_non_par_son_texte(): void
    {
        $ville = GeoCity::factory()->create(['name' => 'Pikine', 'slug' => 'pikine']);
        $quartier = GeoNeighborhood::factory()->create(['geo_city_id' => $ville->id, 'name' => 'Sacré-Cœur 3', 'slug' => 'sacre-coeur-3']);
        $rattache = $this->bien('Pikine', null, $quartier->id);
        // Un texte resté en arrière du référentiel (renommage sans réécriture, P17.03) : seul
        // l'identifiant dit où est le bien.
        DB::table('addresses')->where('addressable_id', $rattache->id)->update(['neighborhood' => 'Ancien nom']);
        $libre = $this->bien('Rufisque', 'Sacre Coeur 3');
        $this->indexProperties();

        $this->assertDeuxCotes([$rattache->id, $libre->id], ['location' => 'Sacré-Cœur 3']);
        $this->assertDeuxCotes([$rattache->id, $libre->id], ['location' => 'sacre coeur 3']);
        $this->assertDeuxCotes([], ['location' => 'Ancien nom']);
    }

    /**
     * TCK-1052 (P67.01) — décision du porteur : un ancien nom fusionné désigne le quartier cible.
     *
     * La fusion réécrit les adresses vers la cible et garde la source avec `merged_into_id`.
     * `idsDuReferentiel()` rendait l'identifiant de la source, qu'aucune adresse ne porte plus : la
     * recherche et l'alerte sur l'ancien nom rendaient 0, sans erreur.
     */
    public function test_un_ancien_nom_fusionne_designe_le_quartier_cible(): void
    {
        $ville = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        $source = GeoNeighborhood::factory()->create(['geo_city_id' => $ville->id, 'name' => 'Liberte Quatre', 'slug' => 'liberte-quatre']);
        $cible = GeoNeighborhood::factory()->create(['geo_city_id' => $ville->id, 'name' => 'Liberté 4', 'slug' => 'liberte-4']);
        $bien = $this->bien('Dakar', 'Liberte Quatre', $source->id);
        $this->indexProperties();
        $this->assertDeuxCotes([$bien->id], ['location' => 'Liberte Quatre']);

        app(GeoNeighborhoodModeration::class)->fusionner($source, $cible, User::factory()->create());
        $this->indexProperties();

        $this->assertDeuxCotes([$bien->id], ['location' => 'Liberté 4']);
        $this->assertDeuxCotes([$bien->id], ['location' => 'Liberte Quatre']);

        $alerte = app(PropertySearchService::class)->alertMatches(
            SavedSearchCriteria::toSearchParams(['location' => 'Liberte Quatre']),
            null,
            now(),
        );
        $this->assertSame(1, $alerte['total']);
        $this->assertSame([$bien->id], $alerte['properties']->pluck('id')->map(fn ($id) => (int) $id)->all());
    }

    private function bien(string $ville, ?string $quartier, ?int $quartierId = null): Property
    {
        $bien = Property::factory()->published()->create(['featured' => false, 'published_at' => now()->subHour()]);
        Address::create(array_filter([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'country' => 'SN',
            'city' => $ville,
            'neighborhood' => $quartier,
            'geo_neighborhood_id' => $quartierId,
            'latitude' => 14.7,
            'longitude' => -17.45,
        ], static fn ($valeur) => $valeur !== null));

        return $bien->fresh();
    }

    /**
     * @param  list<int>  $attendus
     * @param  array<string, string>  $criteres
     */
    private function assertDeuxCotes(array $attendus, array $criteres): void
    {
        sort($attendus);
        $liste = $this->getJson('/api/public/properties/search?'.http_build_query([...$criteres, 'per_page' => 100]))->assertOk();
        $idsListe = array_map('intval', array_unique([
            ...array_column($liste->json('data') ?? [], 'id'),
            ...array_column($liste->json('sponsored') ?? [], 'id'),
        ]));
        sort($idsListe);
        $this->assertSame($attendus, array_values($idsListe), 'la liste, pour '.json_encode($criteres, JSON_UNESCAPED_UNICODE));

        $carte = $this->getJson('/api/public/properties/map?'.http_build_query(['bounds' => self::CADRAGE, ...$criteres]))->assertOk();
        $idsCarte = array_map(static fn (array $f) => (int) $f['properties']['id'], $carte->json('features'));
        sort($idsCarte);
        $this->assertSame($attendus, $idsCarte, 'la carte, pour '.json_encode($criteres, JSON_UNESCAPED_UNICODE));
    }
}
