<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Services\Search\RepartitionDesPrix;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-2498 — `GET /api/public/properties/price-distribution` : la répartition des prix sous les filtres de la liste.
 */
class PriceDistributionTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private string $url = '/api/public/properties/price-distribution';

    private function bien(float $prix, string $quartier, array $attributs = []): Property
    {
        $bien = Property::factory()->published()->create([
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => $prix,
            ...$attributs,
        ]);
        Address::factory()->create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'city' => 'Dakar',
            'neighborhood' => $quartier,
        ]);

        return $bien;
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->bien(150_000, 'Mermoz');
        $this->bien(180_000, 'Mermoz');
        $this->bien(450_000, 'Mermoz');
        $this->bien(900_000, 'Almadies');
        $this->bien(1_250_000, 'Almadies');
        // À vendre : une autre échelle, jamais dans la répartition des loyers.
        $this->bien(95_000_000, 'Almadies', ['contract_type' => ContractType::Sale, 'rent_period' => null]);
        // Hors de la liste : un bien de test et un brouillon, aux prix extrêmes qui étireraient les tranches.
        $this->bien(5_000_000, 'Mermoz', ['is_test' => true]);
        $this->bien(10_000, 'Mermoz', ['status' => PropertyStatus::Draft, 'published_at' => null]);
        $this->indexProperties();
    }

    /** AC1 — la somme des `count` égale le `meta.total` de la liste sous les mêmes filtres, sans bornes de prix. */
    public function test_ac1_la_somme_des_tranches_est_le_total_de_la_liste(): void
    {
        $data = $this->getJson($this->url.'?contract_type=rent&price_max=200000')->assertOk()->json('data');

        $total = $this->getJson('/api/public/properties/search?contract_type=rent')->json('meta.total');
        $this->assertSame(5, $total);
        $this->assertSame($total, array_sum(array_column($data['buckets'], 'count')));
        $this->assertSame(150000, $data['min']);
        $this->assertSame(1250000, $data['max']);

        $this->assertLessThanOrEqual(RepartitionDesPrix::TRANCHES_MAX, count($data['buckets']));
        foreach ($data['buckets'] as $i => $tranche) {
            $this->assertSame(0, $tranche['from'] % 1000, 'borne arrondie au millier');
            $this->assertSame(0, $tranche['to'] % 1000, 'borne arrondie au millier');
            // Chaque tranche est celle que la liste rend sous ses bornes (`to` exclu).
            $liste = $this->getJson('/api/public/properties/search?'.http_build_query([
                'contract_type' => 'rent', 'price_min' => $tranche['from'], 'price_max' => $tranche['to'] - 1,
            ]))->json('meta.total');
            $this->assertSame($liste, $tranche['count'], "tranche {$i}");
        }
        // Les bornes extrêmes ne viennent ni du bien de test ni du brouillon.
        $this->assertLessThanOrEqual(150000, $data['buckets'][0]['from']);
        $this->assertGreaterThan(1250000, end($data['buckets'])['to']);
        $this->assertLessThan(5_000_000, end($data['buckets'])['to']);
    }

    /** AC2 — un filtre de quartier change la répartition. */
    public function test_ac2_un_filtre_de_quartier_change_la_repartition(): void
    {
        $tout = $this->getJson($this->url.'?contract_type=rent')->json('data');
        $mermoz = $this->getJson($this->url.'?contract_type=rent&location=Mermoz')->json('data');

        $this->assertNotEquals($tout, $mermoz);
        $this->assertSame(3, array_sum(array_column($mermoz['buckets'], 'count')));
        $this->assertSame(450000, $mermoz['max']);
    }

    /** AC3 — sans `contract_type`, 422. */
    public function test_ac3_sans_contrat_422(): void
    {
        $this->getJson($this->url)->assertStatus(422)->assertJsonValidationErrors('contract_type');
        $this->getJson($this->url.'?contract_type=lease')->assertStatus(422);
    }

    /**
     * Revue de TCK-2498 (contre-vérification) — en location, sans `rent_period`, l'histogramme compte le loyer AU MOIS,
     * implicite (période nulle, le cas de 519 locations sur 641 en développement) ou déclaré : une location sans période
     * et une au mois y entrent, une à la nuit et une à l'année non. Un `rent_period` explicite est respecté.
     */
    public function test_en_location_le_loyer_au_mois_implicite_ou_declare(): void
    {
        $sansPeriode = $this->bien(200_000, 'Ouakam');
        // L'événement `saving` du modèle pose `monthly` à toute location sans période : la période nulle s'écrit hors du
        // modèle, comme dans les données qui la portent.
        DB::table('properties')->where('id', $sansPeriode->id)->update(['rent_period' => null]);
        $this->bien(300_000, 'Ouakam');
        $this->bien(35_000, 'Ouakam', ['rent_period' => RentPeriod::Daily]);
        $this->bien(4_000_000, 'Ouakam', ['rent_period' => RentPeriod::Yearly]);
        $this->indexProperties();

        $defaut = $this->getJson($this->url.'?contract_type=rent&location=Ouakam')->assertOk()->json('data');
        $this->assertSame(2, array_sum(array_column($defaut['buckets'], 'count')));
        $this->assertSame(200000, $defaut['min']);
        $this->assertSame(300000, $defaut['max']);

        // Sur une liste qui n'a que des loyers au mois (AC1, `setUp`), l'histogramme et la liste comptent pareil.
        $this->assertSame(
            $this->getJson('/api/public/properties/search?contract_type=rent&location=Mermoz')->json('meta.total'),
            array_sum(array_column($this->getJson($this->url.'?contract_type=rent&location=Mermoz')->json('data.buckets'), 'count')),
        );

        $nuit = $this->getJson($this->url.'?contract_type=rent&location=Ouakam&rent_period=daily')->assertOk()->json('data');
        $this->assertSame(1, array_sum(array_column($nuit['buckets'], 'count')));
        $this->assertSame(35000, $nuit['min']);
        $mois = $this->getJson($this->url.'?contract_type=rent&location=Ouakam&rent_period=monthly')->assertOk()->json('data');
        $this->assertSame(1, array_sum(array_column($mois['buckets'], 'count')), 'monthly explicite : la liste ne compte que le déclaré');
    }

    /**
     * Revue de TCK-2498 — `agency`/`agent` sont résolus AVANT la clé de cache : une agence mise hors ligne rend un
     * histogramme vide sur-le-champ, comme la liste, et non la répartition gardée en cache.
     */
    public function test_une_agence_mise_hors_ligne_vide_l_histogramme_en_cache(): void
    {
        $agence = Agency::factory()->create(['slug' => 'agence-x']);
        $this->bien(300_000, 'Mermoz', ['agency_id' => $agence->id]);
        $this->indexProperties();

        $avant = $this->getJson($this->url.'?contract_type=rent&agency=agence-x')->assertOk()->json('data');
        $this->assertSame(1, array_sum(array_column($avant['buckets'], 'count')));

        $agence->update(['status' => AgencyStatus::Suspended]);
        $this->assertSame(0, $this->getJson('/api/public/properties/search?agency=agence-x')->json('meta.total'), 'témoin : la liste');

        $this->getJson($this->url.'?contract_type=rent&agency=agence-x')->assertOk()
            ->assertExactJson(['data' => ['buckets' => [], 'min' => null, 'max' => null]]);
    }

    public function test_sans_bien_une_repartition_vide(): void
    {
        $this->getJson($this->url.'?contract_type=rent&location=Yoff')->assertOk()
            ->assertExactJson(['data' => ['buckets' => [], 'min' => null, 'max' => null]]);
    }

    public function test_les_tranches_couvrent_le_minimum_et_le_maximum(): void
    {
        foreach ([[150_000, 1_250_000], [1, 1], [0, 999_999_999], [12_345, 12_345], [999, 1001]] as [$min, $max]) {
            [$debut, $largeur, $nombre] = RepartitionDesPrix::tranches($min, $max);
            $this->assertLessThanOrEqual($min, $debut);
            $this->assertGreaterThan($max, $debut + $nombre * $largeur);
            $this->assertLessThanOrEqual(RepartitionDesPrix::TRANCHES_MAX, $nombre);
            $this->assertGreaterThanOrEqual(1000, $largeur);
        }
    }
}
