<?php

namespace Tests\Feature\Geo;

use App\Models\Address;
use App\Models\GeoCity;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
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
