<?php

namespace Tests\Feature\Public;

use App\Http\Requests\Public\MapPublicPropertyRequest;
use App\Http\Requests\Public\SearchPublicPropertyRequest;
use App\Models\Address;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-346 / ADR-0023 — le rayon sur `GET /api/public/properties/map`.
 *
 * ## Ce que ce fichier garde
 *
 * `/search` (Meilisearch) et `/map` (SQL Eloquent) sont deux endpoints, mais un
 * seul écran : `PropertiesDiscoveryPage` bascule `list` ↔ `map` sans changer de
 * filtres. Tant que `/map` ignorait `radius_km`, poser « à moins de 3 km » puis
 * basculer en carte faisait RÉAPPARAÎTRE les biens que la liste venait d'écarter.
 * Le défaut est silencieux — deux comptes différents, aucune erreur.
 *
 * ⚠ Les distances de ce fichier ne sont pas approximatives : tous les points
 * partagent la MÊME longitude, si bien que la distance est un pur écart de
 * latitude, et 1° de latitude vaut 111,19 km partout sur le globe. Un point à
 * +0,0100° est donc à 1,11 km, +0,0500° à 5,56 km, +0,5000° à 55,6 km — sans
 * dépendre de la latitude de référence ni du modèle de sphéroïde du moteur.
 * Même convention que `Tests\Feature\Search\PropertyGeoSearchTest`.
 */
class PropertyMapRadiusTest extends TestCase
{
    use RefreshDatabase;

    /** Le centre de recherche : un point de Dakar. */
    private const CENTRE_LAT = 14.7000;

    private const CENTRE_LNG = -17.4500;

    /** Un cadrage assez large pour contenir les trois biens alignés ci-dessous. */
    private const CADRAGE_LARGE = '14.0,-18.0,15.5,-17.0';

    private function bienGeolocalise(string $titre, ?float $lat, ?float $lng): Property
    {
        $property = Property::factory()->published()->create(['title' => $titre]);

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
        return [
            $this->bienGeolocalise('Proche', self::CENTRE_LAT + 0.0100, self::CENTRE_LNG),
            $this->bienGeolocalise('Moyen', self::CENTRE_LAT + 0.0500, self::CENTRE_LNG),
            $this->bienGeolocalise('Loin', self::CENTRE_LAT + 0.5000, self::CENTRE_LNG),
        ];
    }

    /** @param array<string,mixed> $params */
    private function urlDeCarte(array $params = []): string
    {
        return '/api/public/properties/map?'.http_build_query(
            array_merge(['bounds' => self::CADRAGE_LARGE], $params)
        );
    }

    /** @return array<int,int> les ids rendus par la collection GeoJSON */
    private function idsRendus(array $params = []): array
    {
        $reponse = $this->getJson($this->urlDeCarte($params));
        $reponse->assertOk();

        return array_map(
            static fn (array $feature) => (int) $feature['properties']['id'],
            $reponse->json('features'),
        );
    }

    public function test_le_rayon_ecarte_les_biens_qui_en_sortent(): void
    {
        [$proche, $moyen, $loin] = $this->troisBiensAlignes();

        // Sans rayon, le cadrage seul rend les trois.
        $this->assertEqualsCanonicalizing(
            [$proche->id, $moyen->id, $loin->id],
            $this->idsRendus(),
            'Le cadrage large doit contenir les trois biens : sans cela le test suivant ne prouve rien.',
        );

        $this->assertEqualsCanonicalizing(
            [$proche->id, $moyen->id],
            $this->idsRendus([
                'lat' => self::CENTRE_LAT,
                'lng' => self::CENTRE_LNG,
                'radius_km' => 10,
            ]),
        );
    }

    /**
     * Le rayon est en KILOMÈTRES, pas en mètres — la faute la plus probable
     * d'un portage, et elle ne se voit pas sur un catalogue dense.
     */
    public function test_le_rayon_est_en_kilometres_et_non_en_metres(): void
    {
        [$proche, $moyen] = $this->troisBiensAlignes();

        // 3 km : le bien à 1,11 km entre, celui à 5,56 km sort.
        $this->assertSame(
            [$proche->id],
            $this->idsRendus([
                'lat' => self::CENTRE_LAT,
                'lng' => self::CENTRE_LNG,
                'radius_km' => 3,
            ]),
        );

        // Si l'unité était le mètre, 3 « km » vaudraient 3 m et ce compte serait 0.
        $this->assertEqualsCanonicalizing(
            [$proche->id, $moyen->id],
            $this->idsRendus([
                'lat' => self::CENTRE_LAT,
                'lng' => self::CENTRE_LNG,
                'radius_km' => 6,
            ]),
        );
    }

    /**
     * Rayon ET cadrage se composent — comme le rayon et le `_geoBoundingBox` de
     * `/search`. Les trois comptes intermédiaires sont assertés, sans quoi
     * « 1 résultat » serait cochable par une clause qui écraserait l'autre.
     */
    public function test_le_rayon_et_le_cadrage_se_composent(): void
    {
        [$proche, $moyen, $loin] = $this->troisBiensAlignes();

        // Cadrage serré : il coupe le bien lointain (14,70 → 15,20 de latitude).
        $cadrageSerre = '14.0,-18.0,14.75,-17.0';

        $this->assertEqualsCanonicalizing(
            [$proche->id, $moyen->id],
            $this->idsRendus(['bounds' => $cadrageSerre]),
            'Le cadrage seul écarte le bien lointain.',
        );

        $this->assertEqualsCanonicalizing(
            [$proche->id, $moyen->id, $loin->id],
            $this->idsRendus([
                'lat' => self::CENTRE_LAT,
                'lng' => self::CENTRE_LNG,
                'radius_km' => 100,
            ]),
            'Le rayon seul, à 100 km, garde les trois.',
        );

        $this->assertSame(
            [$proche->id],
            $this->idsRendus([
                'bounds' => $cadrageSerre,
                'lat' => self::CENTRE_LAT,
                'lng' => self::CENTRE_LNG,
                'radius_km' => 3,
            ]),
            'Les deux ensemble ne gardent que ce qui satisfait les DEUX.',
        );
    }

    /**
     * Un bien sans coordonnées est exclu du rayon — même règle que `_geoRadius`
     * sur `/search` : on ne promet pas ce qu'on ne sait pas.
     */
    public function test_un_bien_sans_coordonnees_est_exclu_du_rayon(): void
    {
        $situe = $this->bienGeolocalise('Situé', self::CENTRE_LAT, self::CENTRE_LNG);
        $this->bienGeolocalise('Sans coordonnées', null, null);

        $this->assertSame(
            [$situe->id],
            $this->idsRendus([
                'lat' => self::CENTRE_LAT,
                'lng' => self::CENTRE_LNG,
                'radius_km' => 50,
            ]),
        );
    }

    /**
     * ⚠ Le cas qui FAISAIT LEVER PostgreSQL avant le clamp `LEAST/GREATEST` de
     * `App\Support\DistanceHaversine` : le point de recherche COÏNCIDE avec les
     * coordonnées d'un bien, `acos()` reçoit 1,0000000000000002, et le moteur
     * rend `SQLSTATE[22003] input is out of range` — là où MySQL et SQLite
     * rendaient NULL. C'est le cas « des biens autour de celui-ci ».
     */
    public function test_un_point_coincidant_avec_un_bien_ne_leve_pas(): void
    {
        $exact = $this->bienGeolocalise('Exactement ici', self::CENTRE_LAT, self::CENTRE_LNG);

        $this->assertSame(
            [$exact->id],
            $this->idsRendus([
                'lat' => self::CENTRE_LAT,
                'lng' => self::CENTRE_LNG,
                'radius_km' => 1,
            ]),
        );
    }

    /**
     * Les bornes sont CELLES DE `/search`, et la constante est la même objet —
     * pas deux valeurs qui coïncident aujourd'hui.
     */
    public function test_le_plafond_de_rayon_est_partage_avec_la_recherche(): void
    {
        $this->assertSame(
            SearchPublicPropertyRequest::RADIUS_KM_MAX,
            MapPublicPropertyRequest::RADIUS_KM_MAX,
        );
    }

    public function test_rayon_au_dela_du_plafond_rend_422(): void
    {
        $this->getJson($this->urlDeCarte([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'radius_km' => MapPublicPropertyRequest::RADIUS_KM_MAX + 1,
        ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['radius_km']);
    }

    public function test_le_plafond_de_rayon_lui_meme_est_accepte(): void
    {
        $bien = $this->bienGeolocalise('Dakar', self::CENTRE_LAT, self::CENTRE_LNG);

        $this->assertSame(
            [$bien->id],
            $this->idsRendus([
                'lat' => self::CENTRE_LAT,
                'lng' => self::CENTRE_LNG,
                'radius_km' => MapPublicPropertyRequest::RADIUS_KM_MAX,
            ]),
        );
    }

    public function test_rayon_nul_ou_negatif_rend_422(): void
    {
        foreach ([0, -1] as $rayon) {
            $this->getJson($this->urlDeCarte([
                'lat' => self::CENTRE_LAT,
                'lng' => self::CENTRE_LNG,
                'radius_km' => $rayon,
            ]))
                ->assertStatus(422)
                ->assertJsonValidationErrors(['radius_km']);
        }
    }

    public function test_rayon_sans_point_rend_422(): void
    {
        $this->getJson($this->urlDeCarte(['radius_km' => 5]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['radius_km']);
    }

    public function test_une_demi_coordonnee_rend_422(): void
    {
        $this->getJson($this->urlDeCarte(['lat' => self::CENTRE_LAT]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['lng']);

        $this->getJson($this->urlDeCarte(['lng' => self::CENTRE_LNG]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['lat']);
    }

    public function test_une_latitude_ou_une_longitude_hors_bornes_rend_422(): void
    {
        $this->getJson($this->urlDeCarte(['lat' => 91, 'lng' => 0]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['lat']);

        $this->getJson($this->urlDeCarte(['lat' => 0, 'lng' => -181]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['lng']);
    }

    /**
     * `/map` n'accepte PAS `sort` — la décision est motivée dans le docblock de
     * `PublicPropertyController::map()`. Ce test épingle l'absence : un `sort`
     * ajouté sans reprendre cette décision ne peut pas passer inaperçu.
     *
     * ⚠ La règle n'existe pas, donc le paramètre est simplement IGNORÉ (200) —
     * ce que ce test asserte, c'est qu'il ne devient pas un contrat. Le jour où
     * `/map` trie, ce test rougit et son docblock dit quoi relire.
     */
    public function test_map_ne_declare_aucun_tri(): void
    {
        $this->assertArrayNotHasKey(
            'sort',
            (new MapPublicPropertyRequest)->rules(),
        );
    }
}
