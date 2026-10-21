<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Services\Crm\ProspectMatcher;
use App\Services\Search\PropertySearchService;
use App\Support\SavedSearchCriteria;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Laravel\Scout\EngineManager;
use Meilisearch\Client;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-787 (P17.03, ADR-0062 §4) — rejouer le référentiel (`geo:sync-referential`, joué à chaque
 * déploiement) réaligne ce qui pointe vers lui, comme la modération le fait :
 *   · un quartier ou une ville que le jeu renomme réécrit le texte des adresses, et réindexe ;
 *   · un quartier que le jeu ajoute rattache l'adresse de sa ville qui le nommait déjà.
 * Chaque cas est rejoué deux fois : le second passage ne change plus rien.
 */
class GeoReferentialRealignementTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const V1 = __DIR__.'/../../fixtures/geo/v1';

    /** @var list<string> */
    private array $repertoires = [];

    protected function tearDown(): void
    {
        foreach ($this->repertoires as $repertoire) {
            File::deleteDirectory($repertoire);
        }
        parent::tearDown();
    }

    /** Le jeu v1, modifié par `$modifier`, écrit dans un répertoire temporaire. */
    private function jeu(callable $modifier): string
    {
        $donnees = json_decode((string) file_get_contents(self::V1.'/sn-dk.json'), true, flags: JSON_THROW_ON_ERROR);
        $donnees = $modifier($donnees);
        $repertoire = sys_get_temp_dir().'/geo-tck787-'.uniqid();
        File::ensureDirectoryExists($repertoire);
        file_put_contents($repertoire.'/sn-dk.json', json_encode($donnees, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
        $this->repertoires[] = $repertoire;

        return $repertoire;
    }

    private function charger(string $repertoire): void
    {
        $this->artisan('geo:sync-referential', ['--dir' => $repertoire])->assertSuccessful();
        $this->waitForMeilisearch();
    }

    private function quartier(string $slug): GeoNeighborhood
    {
        return GeoNeighborhood::query()->where('slug', $slug)->firstOrFail();
    }

    /** @return list<int> */
    private function biensOu(string $champ, string|int $valeur): array
    {
        return Property::search('')->where($champ, $valeur)->keys()->map(fn ($k) => (int) $k)->all();
    }

    private function bienA(string $ville, string $quartier): Property
    {
        $bien = Property::factory()->published()->create();
        Address::factory()->create([
            'addressable_type' => Property::class, 'addressable_id' => $bien->id,
            'city' => $ville, 'region' => null, 'neighborhood' => $quartier,
        ]);

        return $bien;
    }

    public function test_un_quartier_renomme_par_le_jeu_reecrit_l_adresse_et_reindexe(): void
    {
        $this->charger(self::V1);
        $bien = $this->bienA('Dakar', 'Point E');
        $pointE = $this->quartier('point-e')->id;
        $this->indexProperties();
        $this->assertSame([$bien->id], $this->biensOu('neighborhood', 'Point E'));

        $renomme = $this->jeu(function (array $d) {
            $d['cities'][0]['neighborhoods'][2]['name'] = 'Point E Amitié';

            return $d;
        });
        $this->charger($renomme);
        $this->charger($renomme);

        $adresse = $bien->address()->firstOrFail();
        $this->assertSame($pointE, $adresse->geo_neighborhood_id);
        $this->assertSame('Point E Amitié', $adresse->neighborhood);
        $this->assertSame([$bien->id], $this->biensOu('neighborhood', 'Point E Amitié'));
        $this->assertSame([], $this->biensOu('neighborhood', 'Point E'));
    }

    /**
     * TCK-1128 (P99.02) — comme le renommage de la console (TCK-1080), l'ancien nom que le jeu
     * retire reste un nom du quartier : `location=<ancien nom>` trouve encore le bien. Sans
     * `renamed_at` : le jeu peut le renommer encore, et chaque nom retiré s'ajoute, sans doublon.
     */
    public function test_un_quartier_renomme_par_le_jeu_garde_son_ancien_nom_en_recherche(): void
    {
        $this->charger(self::V1);
        $bien = $this->bienA('Dakar', 'Point E');
        $this->indexProperties();

        $renomme = $this->jeu(function (array $d) {
            $d['cities'][0]['neighborhoods'][2]['name'] = 'Point E Amitié';

            return $d;
        });
        $this->charger($renomme);
        $this->charger($renomme);

        $quartier = $this->quartier('point-e');
        $this->assertSame(['Point E'], $quartier->former_names);
        $this->assertNull($quartier->renamed_at);
        $this->assertSame([$bien->id], $this->biensDuFiltre('Point E'));
        $this->assertSame([$bien->id], $this->biensDuFiltre('Point E Amitié'));

        $encore = $this->jeu(function (array $d) {
            $d['cities'][0]['neighborhoods'][2]['name'] = 'Point E Nord';

            return $d;
        });
        $this->charger($encore);
        $this->charger($renomme);

        $quartier->refresh();
        $this->assertSame('Point E Amitié', $quartier->name);
        $this->assertSame(['Point E', 'Point E Amitié', 'Point E Nord'], $quartier->former_names);
        $this->assertSame([$bien->id], $this->biensDuFiltre('Point E'));
    }

    /** @return list<int> */
    private function biensDuFiltre(string $location): array
    {
        $ids = array_map('intval', array_column(
            $this->getJson('/api/public/properties/search?'.http_build_query(['location' => $location, 'per_page' => 100]))
                ->assertOk()->json('data') ?? [],
            'id',
        ));
        sort($ids);

        return $ids;
    }

    public function test_une_ville_renommee_par_le_jeu_reecrit_l_adresse_sans_perdre_son_quartier(): void
    {
        $this->charger(self::V1);
        $bien = $this->bienA('Guédiawaye', 'Golf Sud');
        $golfSud = $this->quartier('golf-sud')->id;
        $ville = GeoCity::query()->where('slug', 'guediawaye')->value('id');
        $this->indexProperties();

        $renomme = $this->jeu(function (array $d) {
            $d['cities'][1]['name'] = 'Guédiawaye Ville';

            return $d;
        });
        $this->charger($renomme);
        $this->charger($renomme);

        $adresse = $bien->address()->firstOrFail();
        $this->assertSame($ville, $adresse->geo_city_id);
        $this->assertSame($golfSud, $adresse->geo_neighborhood_id);
        $this->assertSame('Guédiawaye Ville', $adresse->city);
        $this->assertSame('Golf Sud', $adresse->neighborhood);
        $this->assertSame([$bien->id], $this->biensOu('city', 'Guédiawaye Ville'));
        $this->assertSame([], $this->biensOu('city', 'Guédiawaye'));
    }

    /**
     * TCK-1165 (P99.03) — une région que le jeu renomme réécrit le texte `region` des adresses de
     * ses villes, et réindexe : sans cela, l'adresse gardait l'ancien nom, une adresse neuve
     * recevait le nouveau (règle 5 du canoniseur), et `region=<nouveau nom>` ne trouvait pas le bien.
     */
    public function test_une_region_renommee_par_le_jeu_reecrit_l_adresse_et_reindexe(): void
    {
        $this->charger(self::V1);
        $bien = $this->bienA('Dakar', 'Point E');
        $this->assertSame('Dakar', $bien->address()->firstOrFail()->region);
        $this->indexProperties();

        $renomme = $this->jeu(function (array $d) {
            $d['region']['name'] = 'Dakar Région';

            return $d;
        });
        $this->charger($renomme);
        $this->charger($renomme);

        $adresse = $bien->address()->firstOrFail();
        $this->assertSame('Dakar Région', $adresse->region);
        $this->assertSame('Dakar', $adresse->city);
        $this->assertNotNull($adresse->geo_neighborhood_id);
        $this->assertSame([$bien->id], $this->biensOu('region', 'Dakar Région'));
        $this->assertSame([], $this->biensOu('region', 'Dakar'));
    }

    /**
     * TCK-1169 (P99.01) — comme un quartier (TCK-1080, TCK-1128), une ville que le jeu renomme
     * garde son ancien nom : une alerte `city` / `cities` et un prospect qui le portent la
     * désignent encore. Avant, les quatre rendaient 0, sans erreur.
     */
    public function test_une_ville_renommee_par_le_jeu_repond_encore_a_son_ancien_nom(): void
    {
        $this->charger(self::V1);
        $agence = Agency::factory()->create();
        $bien = $this->bienA('Guédiawaye', 'Golf Sud');
        $bien->update(['agency_id' => $agence->id]);
        $prospect = Customer::factory()->create([
            'agency_id' => $agence->id,
            'pipeline_stage' => CustomerPipelineStage::Prospect,
            'seeking_cities' => ['Guédiawaye'],
        ]);
        $this->indexProperties();

        $renomme = $this->jeu(function (array $d) {
            $d['cities'][1]['name'] = 'Guédiawaye Ville';

            return $d;
        });
        $this->charger($renomme);
        $this->charger($renomme);

        $recherche = app(PropertySearchService::class);
        foreach ([['city' => 'Guédiawaye'], ['cities' => ['Guédiawaye']], ['city' => 'Guédiawaye Ville']] as $criteres) {
            $this->assertSame(
                [$bien->id],
                $recherche->alertMatches(SavedSearchCriteria::toSearchParams($criteres), null, now())['properties']->pluck('id')->all(),
                json_encode($criteres, JSON_UNESCAPED_UNICODE),
            );
        }
        $matcher = app(ProspectMatcher::class);
        $this->assertSame([$bien->id], $matcher->propertiesFor($prospect->fresh())->pluck('properties.id')->all());
        $this->assertSame([$prospect->id], $matcher->customersFor($bien->fresh())->pluck('customers.id')->all());
        $this->assertSame(['Guédiawaye'], GeoCity::query()->where('slug', 'guediawaye')->firstOrFail()->former_names);
    }

    public function test_un_quartier_ajoute_par_le_jeu_rattache_l_adresse_de_sa_ville(): void
    {
        $this->charger(self::V1);
        $bien = $this->bienA('Dakar', 'liberté 5');
        $adresse = $bien->address()->firstOrFail();
        $this->assertNotNull($adresse->geo_city_id);
        $this->assertNull($adresse->geo_neighborhood_id);
        $this->indexProperties();

        $this->charger(__DIR__.'/../../fixtures/geo/v2');
        $this->charger(__DIR__.'/../../fixtures/geo/v2');

        $liberte5 = $this->quartier('liberte-5')->id;
        $relue = $adresse->refresh();
        $this->assertSame($liberte5, $relue->geo_neighborhood_id);
        $this->assertSame('Liberté 5', $relue->neighborhood);
        $this->assertSame([$bien->id], $this->biensOu('geo_neighborhood_id', $liberte5));
    }

    /**
     * TCK-1155 (P89.01) — une réindexation qui échoue ne laisse pas les renommages écrits sans
     * leur index : le passage suivant, moteur rétabli, réindexe. Avant, le premier passage
     * validait le nouveau nom en base, le second ne voyait plus rien à renommer, et l'index
     * gardait l'ancien nom pour toujours.
     */
    public function test_une_reindexation_en_echec_est_rejouee_au_passage_suivant(): void
    {
        $this->charger(self::V1);
        $bien = $this->bienA('Dakar', 'Point E');
        $this->indexProperties();

        $renomme = $this->jeu(function (array $d) {
            $d['cities'][0]['neighborhoods'][2]['name'] = 'Point E Amitié';

            return $d;
        });
        $this->assertFalse($this->chargerMoteurEnPanne($renomme));
        $this->charger($renomme);

        $this->assertSame('Point E Amitié', $bien->address()->firstOrFail()->neighborhood);
        $this->assertSame([$bien->id], $this->biensOu('neighborhood', 'Point E Amitié'));
        $this->assertSame([], $this->biensOu('neighborhood', 'Point E'));
    }

    /** TCK-1155 (P89.01) — de même pour le rattachement d'une adresse à un quartier ajouté. */
    public function test_un_rattachement_dont_la_reindexation_echoue_est_rejoue(): void
    {
        $this->charger(self::V1);
        $bien = $this->bienA('Dakar', 'liberté 5');
        $this->indexProperties();

        $this->assertFalse($this->chargerMoteurEnPanne(__DIR__.'/../../fixtures/geo/v2'));
        $this->charger(__DIR__.'/../../fixtures/geo/v2');

        $liberte5 = $this->quartier('liberte-5')->id;
        $this->assertSame($liberte5, $bien->address()->firstOrFail()->geo_neighborhood_id);
        $this->assertSame([$bien->id], $this->biensOu('geo_neighborhood_id', $liberte5));
    }

    /**
     * Joue la commande avec un client Meilisearch qui vise un hôte injoignable, puis rétablit le
     * vrai. Rend vrai si la commande a réussi.
     */
    private function chargerMoteurEnPanne(string $repertoire): bool
    {
        $vrai = app(Client::class);
        app()->instance(Client::class, new Client('http://127.0.0.1:1', 'cle'));
        app(EngineManager::class)->forgetDrivers();
        try {
            return Artisan::call('geo:sync-referential', ['--dir' => $repertoire]) === 0;
        } catch (\Throwable) {
            return false;
        } finally {
            app()->instance(Client::class, $vrai);
            app(EngineManager::class)->forgetDrivers();
        }
    }

    public function test_un_quartier_inconnu_ne_cree_aucune_proposition(): void
    {
        $this->charger(self::V1);
        $bien = $this->bienA('Dakar', 'Quartier Inconnu');
        $avant = GeoNeighborhood::query()->count();

        $this->charger(self::V1);

        $this->assertSame($avant, GeoNeighborhood::query()->count());
        $this->assertNull($bien->address()->firstOrFail()->geo_neighborhood_id);
        $this->assertSame('Quartier Inconnu', $bien->address()->firstOrFail()->neighborhood);
    }
}
