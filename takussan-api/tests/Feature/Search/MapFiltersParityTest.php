<?php

namespace Tests\Feature\Search;

use App\Http\Requests\Public\MapPublicPropertyRequest;
use App\Http\Requests\Public\SearchPublicPropertyRequest;
use App\Models\Address;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-633 (lot E, AC6) — les mêmes filtres rendent le même compte en liste et en carte.
 *
 * `/search` interroge Meilisearch (`PropertySearchService::buildFilter()`), `/map` interroge
 * PostgreSQL (ADR-0023, `FiltresDeLaCarte`) : deux traductions du même vocabulaire. La carte ne
 * recevait que le type, la transaction, le prix et le rayon — un visiteur qui posait « 3 chambres,
 * meublé, à Dakar » voyait en carte des biens que la liste venait d'écarter.
 *
 * Le patron est celui de `SavedSearchCriteriaVocabularyTest` : deux biens qui ne diffèrent QUE par
 * la clé éprouvée, la liste et la carte doivent rendre le même bien, et le témoin sans la clé rend
 * les deux des deux côtés. `test_chaque_cle_de_la_carte_a_sa_ligne` rougit sur toute clé acceptée
 * par la carte sans ligne ici : une clé ajoutée à la liste ne peut pas rester ignorée en silence.
 *
 * Les critères sont des CHAÎNES, comme les écrit le front (`type=house,villa`, `furnished=false`).
 * `featured` vaut `false` par défaut : les places réservées du lot F ne brouillent pas les
 * ensembles. Les dates sont relatives (calculées en PHP pur, le provider tourne hors application).
 */
class MapFiltersParityTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const CADRAGE = '14.0,-18.0,15.5,-16.5';

    private const POINT = ['lat' => '14.7', 'lng' => '-17.45', 'radius_km' => '3'];

    /** Le point et son rayon voyagent ensemble : un témoin qui n'en retirerait qu'un rendrait 422. */
    private const CLES_DU_POINT = ['lat', 'lng', 'radius_km'];

    private const BASE = [
        'title' => 'Villa avec piscine',
        'description' => 'Belle maison lumineuse.',
        'type' => 'villa',
        'contract_type' => 'rent',
        'rent_period' => 'monthly',
        'price' => 200_000,
        'bedrooms' => 3,
        'bathrooms' => 2,
        'area' => 120,
        'furnished' => true,
        'featured' => false,
        'floor_number' => 2,
        'title_type' => 'titre_foncier',
        'condition' => 'new',
    ];

    private const BASE_ADDRESS = ['city' => 'Dakar', 'neighborhood' => 'Almadies', 'latitude' => 14.7, 'longitude' => -17.45];

    /**
     * [clé, critères, écart de B, écart d'adresse de B, équipements de A, équipements de B, bien retenu].
     *
     * ⚠ Pour une clé multi-valuée en OU (`type`, `condition`), A porte la SECONDE valeur : une liste
     * réduite à son premier élément l'écarterait. La forme « dernière valeur seule » est gardée par
     * `test_une_liste_en_ou_garde_chacune_de_ses_valeurs`. Les équipements sont un ET (décision 4
     * du porteur) : A les offre tous, B n'en offre qu'un — le dernier sur une ligne, le premier sur
     * l'autre —, et seul A répond.
     *
     * @return array<string, array{0: string, 1: array<string, string>, 2: array<string, mixed>, 3: array<string, mixed>, 4: list<string>, 5: list<string>, 6: string}>
     */
    public static function cles(): array
    {
        return [
            'location' => ['location', ['location' => 'Almadies'], [], ['neighborhood' => 'Médina'], [], [], 'A'],
            'city' => ['city', ['city' => 'Dakar'], [], ['city' => 'Thiès'], [], [], 'A'],
            'price_min' => ['price_min', ['price_min' => '150000'], ['price' => 100_000], [], [], [], 'A'],
            'price_max' => ['price_max', ['price_max' => '300000'], ['price' => 400_000], [], [], [], 'A'],
            'bedrooms' => ['bedrooms', ['bedrooms' => '3'], ['bedrooms' => 2], [], [], [], 'A'],
            'bathrooms' => ['bathrooms', ['bathrooms' => '2'], ['bathrooms' => 1], [], [], [], 'A'],
            'area_min' => ['area_min', ['area_min' => '100'], ['area' => 60], [], [], [], 'A'],
            'area_max' => ['area_max', ['area_max' => '150'], ['area' => 200], [], [], [], 'A'],
            'featured' => ['featured', ['featured' => 'true'], ['featured' => true], [], [], [], 'B'],
            'type' => ['type', ['type' => 'house,villa'], ['type' => 'apartment'], [], [], [], 'A'],
            'contract_type' => ['contract_type', ['contract_type' => 'rent'], ['contract_type' => 'sale', 'rent_period' => null], [], [], [], 'A'],
            'rent_period' => ['rent_period', ['rent_period' => 'monthly'], ['rent_period' => 'daily'], [], [], [], 'A'],
            'furnished oui' => ['furnished', ['furnished' => 'true'], ['furnished' => false], [], [], [], 'A'],
            'furnished non' => ['furnished', ['furnished' => 'false'], ['furnished' => false], [], [], [], 'B'],
            'tags' => ['tags', ['tags' => 'Piscine'], [], [], ['Piscine'], [], 'A'],
            'tags ET' => ['tags', ['tags' => 'Piscine,Parking'], [], [], ['Piscine', 'Parking'], ['Parking'], 'A'],
            // D1 (vérification du lot E) — B n'offre que le PREMIER équipement demandé : une carte qui
            // n'appliquerait que le premier (`reset()`, `array_slice(…, 0, 1)`, un `whereHas` hors
            // boucle) rendrait A ET B. La ligne du dessus ne garde que la forme « dernier seul ».
            'tags ET (premier seul)' => ['tags', ['tags' => 'Piscine,Parking'], [], [], ['Piscine', 'Parking'], ['Piscine'], 'A'],
            'lat' => ['lat', self::POINT, [], ['latitude' => 14.9, 'longitude' => -17.2], [], [], 'A'],
            'lng' => ['lng', self::POINT, [], ['latitude' => 14.9, 'longitude' => -17.2], [], [], 'A'],
            'radius_km' => ['radius_km', self::POINT, [], ['latitude' => 14.9, 'longitude' => -17.2], [], [], 'A'],
            'floor_number' => ['floor_number', ['floor_number' => '2'], ['floor_number' => 1], [], [], [], 'A'],
            'title_type' => ['title_type', ['title_type' => 'titre_foncier'], ['title_type' => 'bail'], [], [], [], 'A'],
            'condition' => ['condition', ['condition' => 'renovated,new'], ['condition' => 'good'], [], [], [], 'A'],
            'available_from' => ['available_from', ['available_from' => self::dansJours(30)], ['available_from' => self::dansJours(60)], [], [], [], 'A'],
        ];
    }

    public function test_la_carte_accepte_les_filtres_de_la_liste_et_eux_seuls(): void
    {
        $carte = array_keys((new MapPublicPropertyRequest)->rules());
        $liste = array_keys((new SearchPublicPropertyRequest)->rules());

        $this->assertEqualsCanonicalizing(
            array_values(array_diff($liste, MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE)),
            array_values(array_diff($carte, ['bounds'])),
        );
        $this->assertContains('bounds', $carte);
        foreach (['q', 'search', 'sort', 'page', 'per_page'] as $propre) {
            $this->assertNotContains($propre, $carte, "« {$propre} » reste propre à la liste");
        }
    }

    public function test_chaque_cle_de_la_carte_a_sa_ligne(): void
    {
        $this->assertEqualsCanonicalizing(
            array_values(array_diff(array_keys((new MapPublicPropertyRequest)->rules()), ['bounds'])),
            array_values(array_unique(array_column(self::cles(), 0))),
        );
    }

    /**
     * @param  array<string, string>  $criteres
     * @param  array<string, mixed>  $ecartB
     * @param  array<string, mixed>  $ecartAdresseB
     * @param  list<string>  $tagsA
     * @param  list<string>  $tagsB
     */
    #[DataProvider('cles')]
    public function test_la_carte_rend_ce_que_rend_la_liste(string $cle, array $criteres, array $ecartB, array $ecartAdresseB, array $tagsA, array $tagsB, string $retenu): void
    {
        $a = $this->bien([], [], $tagsA);
        $b = $this->bien($ecartB, $ecartAdresseB, $tagsB);
        $this->indexProperties();

        $attendu = $retenu === 'A' ? [$a->id] : [$b->id];
        $this->assertSame($attendu, $this->idsDeLaListe($criteres), "« {$cle} » : la liste");
        $this->assertSame($attendu, $this->idsDeLaCarte($criteres), "« {$cle} » : la carte doit rendre ce que rend la liste");

        $retirees = in_array($cle, self::CLES_DU_POINT, true) ? self::CLES_DU_POINT : [$cle];
        $temoin = array_diff_key($criteres, array_flip($retirees));
        $deux = $this->tries([$a->id, $b->id]);
        $this->assertSame($deux, $this->idsDeLaListe($temoin), "témoin de « {$cle} » : la liste rend les deux");
        $this->assertSame($deux, $this->idsDeLaCarte($temoin), "témoin de « {$cle} » : la carte rend les deux");
    }

    /**
     * D2 (vérification du lot E) — `[clé, critères, valeur de A, valeur de C, valeur de B]`.
     *
     * A porte la PREMIÈRE valeur demandée, C la SECONDE, B une troisième, hors liste : la liste et la
     * carte rendent [A, C]. Une traduction qui ne garderait que la première valeur rend [A], que la
     * dernière, [C] — chacune rougit, là où la ligne à deux biens de `cles()` ne voit que la première.
     *
     * @return array<string, array{0: string, 1: string, 2: string, 3: string, 4: string}>
     */
    public static function listesEnOu(): array
    {
        return [
            'type' => ['type', 'house,villa', 'house', 'villa', 'apartment'],
            'condition' => ['condition', 'renovated,new', 'renovated', 'new', 'good'],
        ];
    }

    #[DataProvider('listesEnOu')]
    public function test_une_liste_en_ou_garde_chacune_de_ses_valeurs(string $cle, string $critere, string $valeurA, string $valeurC, string $valeurB): void
    {
        $a = $this->bien([$cle => $valeurA], [], []);
        $c = $this->bien([$cle => $valeurC], [], []);
        $this->bien([$cle => $valeurB], [], []);
        $this->indexProperties();

        $attendu = $this->tries([$a->id, $c->id]);
        $this->assertSame($attendu, $this->idsDeLaListe([$cle => $critere]), "« {$cle} » : la liste rend chaque valeur demandée");
        $this->assertSame($attendu, $this->idsDeLaCarte([$cle => $critere]), "« {$cle} » : la carte rend chaque valeur demandée, pas seulement la première ni la dernière");
    }

    public function test_la_carte_lit_les_chambres_comme_un_minimum(): void
    {
        $six = $this->bien(['bedrooms' => 6], [], []);
        $cinq = $this->bien(['bedrooms' => 5], [], []);
        $this->bien(['bedrooms' => 4], [], []);
        $this->indexProperties();

        $attendu = $this->tries([$six->id, $cinq->id]);
        $this->assertSame($attendu, $this->idsDeLaListe(['bedrooms' => '5']));
        $this->assertSame($attendu, $this->idsDeLaCarte(['bedrooms' => '5']));
    }

    /**
     * La casse d'une ville saisie à la main dans l'URL (`city=dakar`) : la carte doit la lire
     * comme la liste. Ce test ne fixe pas la règle, il fixe l'ACCORD.
     */
    public function test_la_casse_de_la_ville_est_lue_comme_par_la_liste(): void
    {
        $this->bien([], [], []);
        $this->indexProperties();

        $this->assertSame($this->idsDeLaListe(['city' => 'dakar']), $this->idsDeLaCarte(['city' => 'dakar']));
    }

    private static function dansJours(int $jours): string
    {
        return date('Y-m-d', (int) strtotime("+{$jours} days"));
    }

    /**
     * @param  array<string, mixed>  $ecart
     * @param  array<string, mixed>  $ecartAdresse
     * @param  list<string>  $equipements
     */
    private function bien(array $ecart, array $ecartAdresse, array $equipements): Property
    {
        $bien = Property::factory()->published()->create([
            ...self::BASE,
            'available_from' => self::dansJours(10),
            ...$ecart,
            'published_at' => now()->subHour(),
        ]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'country' => 'SN',
            ...self::BASE_ADDRESS,
            ...$ecartAdresse,
        ]);
        foreach ($equipements as $nom) {
            $tag = Tag::query()->where('name', $nom)->first()
                ?? Tag::factory()->create(['name' => $nom, 'type' => TagType::Amenity]);
            $bien->tags()->attach($tag);
        }

        return $bien;
    }

    /**
     * Les ids de la liste — `data`, plus `sponsored` quand le lot F l'expose (hors pagination, et
     * soumis aux mêmes filtres : ADR-0061). L'union dédoublonne.
     *
     * @param  array<string, string>  $criteres
     * @return list<int>
     */
    private function idsDeLaListe(array $criteres): array
    {
        $reponse = $this->getJson('/api/public/properties/search?'.http_build_query([...$criteres, 'per_page' => 100]))->assertOk();

        return $this->tries(array_unique([
            ...array_column($reponse->json('data') ?? [], 'id'),
            ...array_column($reponse->json('sponsored') ?? [], 'id'),
        ]));
    }

    /**
     * @param  array<string, string>  $criteres
     * @return list<int>
     */
    private function idsDeLaCarte(array $criteres): array
    {
        $reponse = $this->getJson('/api/public/properties/map?'.http_build_query(['bounds' => self::CADRAGE, ...$criteres]))->assertOk();
        $ids = array_map(static fn (array $feature) => (int) $feature['properties']['id'], $reponse->json('features'));
        $this->assertSame(count($ids), $reponse->json('meta.returned'));

        return $this->tries($ids);
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
