<?php

namespace Tests\Feature\Search;

use App\Models\Address;
use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Services\Model\SearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-346 / ADR-0023 — le TROISIÈME chemin géographique du dépôt, sous test.
 *
 * `App\Services\Model\SearchService` porte une formule haversine SQL complète
 * (`6371 * acos(…)`, `SearchService.php:63-77`) et un second bounding box. Il
 * n'est atteint par AUCUNE route HTTP : son seul appelant est
 * `App\Jobs\SendSavedSearchAlerts:19`, qui envoie des notifications aux
 * utilisateurs à partir de `SavedSearch.criteria` — un tableau libre, validé
 * `['required','array']`, sans schéma de clés.
 *
 * Autrement dit : du code de production qui écrit aux utilisateurs, et que rien
 * ne couvrait. Ce fichier est le plancher — il ne prétend pas couvrir tout le
 * service, seulement sa partie géographique, qui est celle que TCK-346 touche.
 *
 * ⚠ Ce chemin NE PASSE PAS par Meilisearch : pas de concern
 * `InteractsWithMeilisearch` ici, c'est du SQL Eloquent.
 *
 * ⚠⚠ Les noms de filtres divergent de ceux de `/api/public/properties/search`
 * (`min_price` ici, `price_min` là-bas). C'est mesuré, c'est écrit dans
 * ADR-0023, et c'est la raison pour laquelle les deux chemins ne convergent pas
 * dans ce chantier : les `criteria` déjà enregistrées ont été écrites avec CES
 * noms-là.
 */
class SearchServiceGeoTest extends TestCase
{
    use RefreshDatabase;

    private const CENTRE_LAT = 14.7000;

    private const CENTRE_LNG = -17.4500;

    private function service(): SearchService
    {
        return app(SearchService::class);
    }

    private function bien(string $titre, ?float $lat, ?float $lng): Property
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
     * Même construction que `PropertyGeoSearchTest` : trois biens sur le même
     * méridien, à 1,11 km / 5,56 km / 55,6 km — la distance est un pur écart de
     * latitude, et 1° de latitude vaut 111,19 km partout.
     *
     * @return array{0:Property,1:Property,2:Property}
     */
    private function troisBiensAlignes(): array
    {
        return [
            $this->bien('A 1,11 km', self::CENTRE_LAT + 0.0100, self::CENTRE_LNG),
            $this->bien('A 5,56 km', self::CENTRE_LAT + 0.0500, self::CENTRE_LNG),
            $this->bien('A 55,6 km', self::CENTRE_LAT + 0.5000, self::CENTRE_LNG),
        ];
    }

    public function test_le_rayon_haversine_exclut_les_biens_au_dela(): void
    {
        [$proche] = $this->troisBiensAlignes();

        $resultat = $this->service()->search([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'radius_km' => 3,
        ]);

        $this->assertSame(1, $resultat->total());
        $this->assertSame($proche->id, $resultat->getCollection()->first()->id);
    }

    /**
     * L'unité : `radius_km` est en kilomètres des DEUX côtés du dépôt. La
     * formule multiplie par 6371 (le rayon terrestre en km) — si elle passait
     * en mètres, un rayon de 10 rendrait 0 et non 2.
     */
    public function test_le_rayon_haversine_est_en_kilometres(): void
    {
        [$proche, $moyen] = $this->troisBiensAlignes();

        $resultat = $this->service()->search([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'radius_km' => 10,
        ]);

        $this->assertSame(2, $resultat->total());
        $this->assertEqualsCanonicalizing(
            [$proche->id, $moyen->id],
            $resultat->getCollection()->pluck('id')->all(),
        );
    }

    public function test_un_bien_sans_coordonnees_est_exclu_du_rayon(): void
    {
        $this->bien('Geolocalise', self::CENTRE_LAT, self::CENTRE_LNG);
        $this->bien('Sans coordonnees', null, null);
        Property::factory()->published()->create(['title' => 'Sans adresse du tout']);

        $this->assertSame(3, $this->service()->search([])->total());

        $resultat = $this->service()->search([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'radius_km' => 50,
        ]);

        $this->assertSame(1, $resultat->total());
        $this->assertSame('Geolocalise', $resultat->getCollection()->first()->title);
    }

    /**
     * L'équateur et le méridien de Greenwich.
     *
     * La garde du service employait `! empty()`, pour qui `0` est vide : un
     * point d'origine sur `lat = 0` ou `lng = 0` faisait DISPARAÎTRE le filtre
     * en silence, et l'alerte notifiait alors le catalogue entier. Corrigé en
     * `is_numeric()` par TCK-346, par alignement sur `PropertySearchService`.
     *
     * ⚠ Aucun bien sénégalais n'est concerné (Dakar est à `lng ≈ -17,45`) : ce
     * test épingle une garde, pas un incident constaté.
     */
    public function test_un_point_sur_l_equateur_ne_desactive_pas_le_filtre(): void
    {
        $this->bien('Sur l equateur', 0.0, 0.0);
        $this->bien('A Dakar', self::CENTRE_LAT, self::CENTRE_LNG);

        $resultat = $this->service()->search([
            'lat' => 0,
            'lng' => 0,
            'radius_km' => 10,
        ]);

        $this->assertSame(1, $resultat->total());
        $this->assertSame('Sur l equateur', $resultat->getCollection()->first()->title);
    }

    /**
     * LE cas qui faisait LEVER PostgreSQL, et il n'a rien d'exotique : c'est
     * « les biens autour de celui-ci », donc un point de recherche qui COÏNCIDE
     * avec les coordonnées d'un bien indexé.
     *
     * L'argument d'`acos()` vaut alors 1 mathématiquement, et l'arithmétique
     * flottante le rend régulièrement à 1,0000000000000002 :
     * `SQLSTATE[22003] input is out of range`. MySQL et SQLite rendaient NULL.
     * Comme `SendSavedSearchAlerts` itère par `each()`, l'exception ne perdait
     * pas UNE recherche — elle tuait le job, donc toutes les alertes suivantes.
     *
     * Corrigé par le `LEAST(1.0, GREATEST(-1.0, …))` de
     * {@see SearchService}. Retirer ce clamp fait
     * rougir ce test par exception, pas par assertion.
     */
    public function test_un_point_qui_coincide_avec_un_bien_ne_fait_pas_lever_le_moteur(): void
    {
        $bien = $this->bien('Le bien de reference', self::CENTRE_LAT, self::CENTRE_LNG);
        $this->bien('Un voisin', self::CENTRE_LAT + 0.0100, self::CENTRE_LNG);

        $resultat = $this->service()->search([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'radius_km' => 0.5,
        ]);

        $this->assertSame(1, $resultat->total());
        $this->assertSame($bien->id, $resultat->getCollection()->first()->id);
    }

    public function test_le_bounding_box_exclut_les_biens_hors_cadre(): void
    {
        $dakar = $this->bien('Dakar', 14.74, -17.50);
        $this->bien('Paris', 48.85, 2.35);

        $resultat = $this->service()->search([
            'lat_min' => 14.6, 'lat_max' => 14.8,
            'lng_min' => -17.6, 'lng_max' => -17.4,
        ]);

        $this->assertSame(1, $resultat->total());
        $this->assertSame($dakar->id, $resultat->getCollection()->first()->id);
    }

    /**
     * Le chemin réel de la production : `SavedSearch.criteria` → alerte e-mail.
     *
     * C'est `getMatchingProperties()` que `SendSavedSearchAlerts` appelle, et
     * il relit `criteria` depuis le modèle — pas le tableau que le job a
     * préparé.
     */
    public function test_les_criteres_geo_d_une_recherche_sauvegardee_sont_appliques(): void
    {
        [$proche] = $this->troisBiensAlignes();

        $recherche = SavedSearch::create([
            'user_id' => User::factory()->create()->id,
            'name' => 'Autour de chez moi',
            'criteria' => [
                'lat' => self::CENTRE_LAT,
                'lng' => self::CENTRE_LNG,
                'radius_km' => 3,
            ],
            'notification_frequency' => 'daily',
            'is_active' => true,
        ]);

        $correspondances = $this->service()->getMatchingProperties($recherche);

        $this->assertCount(1, $correspondances);
        $this->assertSame($proche->id, $correspondances->first()->id);
    }

    /**
     * Un bien non public ne peut pas atteindre une alerte, filtre géo ou non.
     */
    public function test_un_brouillon_n_est_jamais_rendu_par_le_rayon(): void
    {
        $publie = $this->bien('Publie', self::CENTRE_LAT, self::CENTRE_LNG);

        $brouillon = Property::factory()->draft()->create(['title' => 'Brouillon']);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $brouillon->id,
            'city' => 'Dakar',
            'latitude' => self::CENTRE_LAT,
            'longitude' => self::CENTRE_LNG,
        ]);

        $resultat = $this->service()->search([
            'lat' => self::CENTRE_LAT,
            'lng' => self::CENTRE_LNG,
            'radius_km' => 1,
        ]);

        $this->assertSame(1, $resultat->total());
        $this->assertSame($publie->id, $resultat->getCollection()->first()->id);
    }
}
