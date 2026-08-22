<?php

namespace Tests\Feature\Search;

use App\Http\Requests\Public\SearchPublicPropertyRequest;
use App\Models\Address;
use App\Models\Property;
use Carbon\CarbonInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\TestCase;

/**
 * TCK-346 / ADR-0023 — le rayon et le tri par distance sur
 * `GET /api/public/properties/search`.
 *
 * ⚠ Les distances de ce fichier ne sont pas approximatives : tous les points
 * partagent la MÊME longitude, si bien que la distance est un pur écart de
 * latitude, et 1° de latitude vaut 111,19 km partout sur le globe. Un point à
 * +0,0100° est donc à 1,11 km, +0,0500° à 5,56 km, +0,5000° à 55,6 km — sans
 * dépendre de la latitude de référence ni du modèle de sphéroïde du moteur.
 * C'est ce qui rend `test_le_rayon_est_en_kilometres_et_non_en_metres`
 * concluant plutôt que « probablement juste ».
 */
class PropertyGeoSearchTest extends TestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** Le centre de recherche : un point de Dakar. */
    private const CENTRE_LAT = 14.7000;

    private const CENTRE_LNG = -17.4500;

    private function bienGeolocalise(string $titre, ?float $lat, ?float $lng, ?CarbonInterface $publieLe = null): Property
    {
        $property = Property::factory()->published()->create(array_filter([
            'title' => $titre,
            'published_at' => $publieLe,
        ]));

        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'city' => 'Dakar',
            'country' => 'SN',
            'latitude' => $lat,
            'longitude' => $lng,
        ]);

        return $property;
    }

    /**
     * Trois biens alignés sur le même méridien : 1,11 km, 5,56 km, 55,6 km.
     *
     * @return array{0:Property,1:Property,2:Property}
     */
    private function troisBiensAlignes(): array
    {
        // ⚠ Les `published_at` sont DÉLIBÉRÉMENT dans l'ordre INVERSE de la
        // distance. Le tri par défaut du service est `featured:desc,
        // published_at:desc` : il rendrait donc `loin, moyen, proche`. Sans
        // cette précaution, les trois biens partageaient le même `published_at`
        // et Meilisearch les rendait dans l'ordre d'insertion — c'est-à-dire
        // exactement l'ordre attendu du tri par distance. MESURÉ : sous ablation
        // de la branche `distance` de `buildSort()`, le test d'ordonnancement
        // restait VERT. Un critère qu'une régression coche n'est pas un critère.
        $proche = $this->bienGeolocalise('A 1,11 km', self::CENTRE_LAT + 0.0100, self::CENTRE_LNG, now()->subDays(3));
        $moyen = $this->bienGeolocalise('A 5,56 km', self::CENTRE_LAT + 0.0500, self::CENTRE_LNG, now()->subDays(2));
        $loin = $this->bienGeolocalise('A 55,6 km', self::CENTRE_LAT + 0.5000, self::CENTRE_LNG, now()->subDay());

        $this->indexProperties();

        return [$proche, $moyen, $loin];
    }

    private function urlDeRecherche(array $params): string
    {
        return '/api/public/properties/search?'.http_build_query($params);
    }

    // ── Le filtre par rayon ───────────────────────────────────────────────────

    public function test_le_rayon_exclut_les_biens_au_dela(): void
    {
        [$proche] = $this->troisBiensAlignes();

        $reponse = $this->getJson($this->urlDeRecherche([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'radius_km' => 3,
        ]));

        $reponse->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(1, $reponse->json('meta.total'));
        $this->assertSame($proche->id, $reponse->json('data.0.id'));
    }

    /**
     * L'UNITÉ, et c'est le piège que le ticket nommait.
     *
     * `_geoRadius` prend des MÈTRES ; le paramètre public est en KILOMÈTRES.
     * Si la conversion `× 1000` disparaissait, `radius_km=10` deviendrait un
     * rayon de 10 mètres et cette assertion tomberait à 0 — pas à 3. Une
     * régression sur l'unité ne peut donc pas cocher ce critère.
     */
    public function test_le_rayon_est_en_kilometres_et_non_en_metres(): void
    {
        [$proche, $moyen] = $this->troisBiensAlignes();

        $reponse = $this->getJson($this->urlDeRecherche([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'radius_km' => 10,
        ]));

        $reponse->assertOk();
        $this->assertSame(2, $reponse->json('meta.total'));
        $this->assertEqualsCanonicalizing(
            [$proche->id, $moyen->id],
            array_column($reponse->json('data'), 'id'),
        );
    }

    /**
     * Un bien sans coordonnées n'a pas de `_geo` dans son document et ne
     * satisfait donc AUCUN rayon. C'est la règle déjà appliquée à `area` et
     * `price` : on ne promet pas ce qu'on ne sait pas.
     */
    public function test_un_bien_sans_coordonnees_est_exclu_du_rayon(): void
    {
        $this->bienGeolocalise('Geolocalise', self::CENTRE_LAT, self::CENTRE_LNG);
        Property::factory()->published()->create(['title' => 'Sans adresse']);
        $this->indexProperties();

        // Sans filtre géo : les deux sortent.
        $this->getJson($this->urlDeRecherche([]))->assertOk()->assertJsonCount(2, 'data');

        $reponse = $this->getJson($this->urlDeRecherche([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'radius_km' => 50,
        ]));

        $reponse->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('Geolocalise', $reponse->json('data.0.title'));
    }

    /**
     * Le rayon et le rectangle sont CONJOINTS — `$filter` est un ET de ses
     * éléments. C'est le sens attendu d'« un rayon, dans le cadrage que je
     * regarde », et c'est ce qui donne son statut au `_geoBoundingBox` que
     * personne n'atteignait (ADR-0023).
     */
    public function test_le_rayon_et_le_rectangle_se_conjoignent(): void
    {
        [$proche, $moyen] = $this->troisBiensAlignes();

        $bande = [
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'lng_min' => self::CENTRE_LNG - 0.1,
            'lng_max' => self::CENTRE_LNG + 0.1,
        ];

        // (a) Le RECTANGLE est large (les trois biens y sont), c'est le RAYON
        //     qui tranche : 10 km → `proche` + `moyen`.
        //     ⚠ Ce cas rougit si la clause `_geoRadius` disparaît — sans lui, les
        //     trois sortent. C'est ce qui manquait à la première version de ce
        //     test, qui restait verte sous ablation du rayon.
        $reponse = $this->getJson($this->urlDeRecherche($bande + [
            'radius_km' => 10,
            'lat_min' => self::CENTRE_LAT - 1.0,
            'lat_max' => self::CENTRE_LAT + 1.0,
        ]));
        $reponse->assertOk();
        $this->assertEqualsCanonicalizing(
            [$proche->id, $moyen->id],
            array_column($reponse->json('data'), 'id'),
        );

        // (b) Le RAYON est large (10 km → deux biens), c'est le RECTANGLE qui
        //     tranche : il ne contient que `proche`.
        //     Ce cas rougit si la clause `_geoBoundingBox` disparaît.
        $reponse = $this->getJson($this->urlDeRecherche($bande + [
            'radius_km' => 10,
            'lat_min' => self::CENTRE_LAT,
            'lat_max' => self::CENTRE_LAT + 0.0200,
        ]));
        $reponse->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($proche->id, $reponse->json('data.0.id'));
    }

    // ── Le tri par distance ───────────────────────────────────────────────────

    /**
     * L'ordre attendu est l'INVERSE de celui que rendrait le tri par défaut
     * (cf. {@see self::troisBiensAlignes()}) : ni un repli sur `published_at`,
     * ni l'ordre d'insertion ne peuvent cocher ce critère.
     *
     * Le compte est asserté ici même : le tri par distance N'EST PAS un filtre,
     * il ne retire aucun bien — pas même ceux qui seraient hors d'un rayon
     * qu'on n'a pas demandé.
     */
    public function test_le_tri_par_distance_classe_du_plus_proche_au_plus_lointain(): void
    {
        [$proche, $moyen, $loin] = $this->troisBiensAlignes();

        $reponse = $this->getJson($this->urlDeRecherche([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'sort' => 'distance',
        ]));

        $reponse->assertOk()->assertJsonCount(3, 'data');
        $this->assertSame(3, $reponse->json('meta.total'));
        $this->assertSame(
            [$proche->id, $moyen->id, $loin->id],
            array_column($reponse->json('data'), 'id'),
        );
    }

    /**
     * Le tri s'inverse quand le centre change de côté : c'est ce qui distingue
     * « trié par distance » de « trié par identifiant croissant », que le test
     * précédent ne saurait pas séparer à lui seul.
     */
    public function test_le_tri_par_distance_depend_du_point_donne(): void
    {
        [$proche, $moyen, $loin] = $this->troisBiensAlignes();

        $reponse = $this->getJson($this->urlDeRecherche([
            'lat' => self::CENTRE_LAT + 0.6000,
            'lng' => self::CENTRE_LNG,
            'sort' => 'distance',
        ]));

        $reponse->assertOk();
        $this->assertSame(
            [$loin->id, $moyen->id, $proche->id],
            array_column($reponse->json('data'), 'id'),
        );
    }

    // ── Les bornes de validation ──────────────────────────────────────────────

    public function test_lat_sans_lng_rend_422(): void
    {
        $this->getJson($this->urlDeRecherche(['lat' => self::CENTRE_LAT]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['lng']);
    }

    public function test_lng_sans_lat_rend_422(): void
    {
        $this->getJson($this->urlDeRecherche(['lng' => self::CENTRE_LNG]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['lat']);
    }

    public function test_latitude_hors_bornes_rend_422(): void
    {
        $this->getJson($this->urlDeRecherche(['lat' => 91, 'lng' => 0]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['lat']);
    }

    public function test_longitude_hors_bornes_rend_422(): void
    {
        $this->getJson($this->urlDeRecherche(['lat' => 0, 'lng' => -181]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['lng']);
    }

    public function test_rayon_nul_ou_negatif_rend_422(): void
    {
        foreach ([0, -1] as $rayon) {
            $this->getJson($this->urlDeRecherche([
                'lat' => self::CENTRE_LAT,
                'lng' => self::CENTRE_LNG,
                'radius_km' => $rayon,
            ]))
                ->assertStatus(422)
                ->assertJsonValidationErrors(['radius_km']);
        }
    }

    public function test_rayon_au_dela_du_plafond_rend_422(): void
    {
        $this->getJson($this->urlDeRecherche([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'radius_km' => SearchPublicPropertyRequest::RADIUS_KM_MAX + 1,
        ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['radius_km']);
    }

    public function test_le_plafond_de_rayon_lui_meme_est_accepte(): void
    {
        $this->bienGeolocalise('Dakar', self::CENTRE_LAT, self::CENTRE_LNG);
        $this->indexProperties();

        $this->getJson($this->urlDeRecherche([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'radius_km' => SearchPublicPropertyRequest::RADIUS_KM_MAX,
        ]))->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_rayon_sans_point_rend_422(): void
    {
        $this->getJson($this->urlDeRecherche(['radius_km' => 5]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['radius_km']);
    }

    /**
     * `sort=distance` sans point rend 422 et NON un repli silencieux sur le tri
     * par défaut : le front croirait trier.
     */
    public function test_sort_distance_sans_point_rend_422(): void
    {
        $this->getJson($this->urlDeRecherche(['sort' => 'distance']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['sort']);
    }

    public function test_une_valeur_de_sort_inconnue_reste_refusee(): void
    {
        $this->getJson($this->urlDeRecherche(['sort' => 'proximite']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['sort']);
    }
}
