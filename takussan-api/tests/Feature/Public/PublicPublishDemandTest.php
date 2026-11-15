<?php

namespace Tests\Feature\Public;

use App\Models\GeoCity;
use App\Models\SearchQueryStat;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * TCK-2603 (ADR-0088, amendement du 2026-11-10, cinquième sortie) — `GET /api/public/publish/demand?city=` : le
 * nombre de recherches des 7 derniers jours dont le filtre de ville est une ville du référentiel, au départ de la
 * publication. Un agrégat et rien d'autre : `{city, searches_7d}`, `null` sous le seuil, arrondi à la dizaine
 * inférieure, cache d'une heure.
 */
class PublicPublishDemandTest extends TestCase
{
    use RefreshDatabase;

    private GeoCity $dakar;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dakar = GeoCity::factory()->create(['name' => 'Dakar', 'slug' => 'dakar']);
        GeoCity::factory()->create(['name' => 'Thiès', 'slug' => 'thies']);
        config(['publish.demand_min_searches' => 200]);
    }

    /** @param  array<string, mixed>  $criteres */
    private function recherches(array $criteres, int $nombre, int $jours = 0): void
    {
        SearchQueryStat::query()->create([
            'day' => now()->subDays($jours)->toDateString(),
            'query_key' => hash('sha256', Str::random(16)),
            'normalized_query' => null,
            'criteria' => $criteres,
            'searches_count' => $nombre,
            'distinct_visitors' => 1,
            'distinct_networks' => 1,
        ]);
    }

    private function lire(?string $ville = 'Dakar'): TestResponse
    {
        return $this->getJson('/api/public/publish/demand'.($ville === null ? '' : '?city='.rawurlencode($ville)));
    }

    // --- AC1 : le seuil, le compte des 7 jours, l'arrondi --------------------------------------------------------------

    public function test_sous_le_seuil_le_chiffre_est_nul(): void
    {
        $this->recherches(['city' => 'Dakar'], 199);

        $this->lire()->assertOk()->assertExactJson(['data' => ['city' => 'Dakar', 'searches_7d' => null]]);
    }

    public function test_au_seuil_le_chiffre_sort(): void
    {
        $this->recherches(['city' => 'Dakar'], 200);

        $this->lire()->assertOk()->assertJsonPath('data.searches_7d', 200);
    }

    public function test_le_total_sort_arrondi_a_la_dizaine_inferieure(): void
    {
        // ADR-0088 (cinquième sortie) : le total exact ne sort pas — 1 247 se lit 1 240.
        $this->recherches(['city' => 'Dakar'], 1000);
        $this->recherches(['city' => 'Dakar', 'type' => 'apartment'], 247, jours: 3);

        $this->lire()->assertOk()->assertJsonPath('data.searches_7d', 1240);
    }

    public function test_le_total_exact_ne_sort_jamais_dans_la_reponse_brute(): void
    {
        // AC1 (amendé le 2026-11-13) : l'API arrondit, le front affiche ce qu'il reçoit — le total exact n'est servi à
        // personne, sous aucune forme.
        $this->recherches(['city' => 'Dakar'], 1247);

        $brut = (string) $this->lire()->assertOk()->getContent();
        $this->assertStringNotContainsString('1247', $brut);
        $this->assertStringNotContainsString('124', str_replace('1240', '', $brut));
        $this->assertStringContainsString('"searches_7d":1240', $brut);
    }

    public function test_la_fenetre_compte_aujourd_hui_et_les_six_jours_d_avant_et_rien_au_dela(): void
    {
        $this->recherches(['city' => 'Dakar'], 150);
        $this->recherches(['city' => 'Dakar'], 60, jours: 6);
        $this->recherches(['city' => 'Dakar'], 5000, jours: 7);

        $this->lire()->assertOk()->assertJsonPath('data.searches_7d', 210);
    }

    public function test_le_seuil_se_regle(): void
    {
        config(['publish.demand_min_searches' => 10]);
        $this->recherches(['city' => 'Dakar'], 12);

        $this->lire()->assertOk()->assertJsonPath('data.searches_7d', 10);
    }

    // --- Ce qui compte pour une ville ----------------------------------------------------------------------------------

    public function test_une_autre_ecriture_de_la_ville_compte_et_une_autre_ville_non(): void
    {
        $this->recherches(['city' => 'DAKAR'], 100);
        $this->recherches(['city' => 'dakar'], 100);
        $this->recherches(['city' => 'Thiès'], 5000);
        // Le filtre de QUARTIER (`location`) n'est pas un filtre de ville.
        $this->recherches(['location' => 'Dakar'], 5000);

        $this->lire()->assertOk()->assertJsonPath('data.searches_7d', 200);
    }

    public function test_une_recherche_sur_plusieurs_villes_compte_pour_chacune_une_seule_fois(): void
    {
        $this->recherches(['cities' => 'Dakar,Thiès'], 150);
        $this->recherches(['city' => 'Dakar', 'cities' => 'Dakar,Thiès'], 50);

        $this->lire()->assertOk()->assertJsonPath('data.searches_7d', 200);
        $this->lire('Thiès')->assertOk()->assertJsonPath('data.searches_7d', 200);
    }

    public function test_un_ancien_nom_de_la_ville_compte_pour_elle(): void
    {
        $this->dakar->forceFill(['former_names' => ['Ndakaaru']])->save();
        $this->recherches(['city' => 'Ndakaaru'], 120);
        $this->recherches(['city' => 'Dakar'], 80);

        $this->lire()->assertOk()->assertJsonPath('data.searches_7d', 200);
    }

    public function test_la_ville_demandee_se_lit_sans_casse_ni_accent_et_la_reponse_porte_son_nom(): void
    {
        $this->recherches(['city' => 'Thiès'], 300);

        $this->lire('THIES')->assertOk()->assertExactJson(['data' => ['city' => 'Thiès', 'searches_7d' => 300]]);
    }

    // --- Sans ville demandée -------------------------------------------------------------------------------------------

    public function test_sans_ville_la_reponse_porte_la_ville_la_plus_recherchee(): void
    {
        $this->recherches(['city' => 'Dakar'], 250);
        $this->recherches(['city' => 'Thiès'], 400);

        $this->lire(null)->assertOk()->assertExactJson(['data' => ['city' => 'Thiès', 'searches_7d' => 400]]);
    }

    public function test_sans_ville_et_sous_le_seuil_aucune_ville_n_est_nommee_par_le_journal(): void
    {
        // Un classement tiré d'un journal sous le seuil serait une sortie : la ville par défaut, sans chiffre.
        $this->recherches(['city' => 'Thiès'], 199);

        $this->lire(null)->assertOk()->assertExactJson(['data' => ['city' => 'Dakar', 'searches_7d' => null]]);
    }

    public function test_sans_ville_seules_les_villes_au_seuil_concourent(): void
    {
        $this->recherches(['city' => 'Thiès'], 199);
        $this->recherches(['city' => 'Dakar'], 150);
        $this->recherches(['city' => 'Dakar'], 50, jours: 2);

        $this->lire(null)->assertOk()->assertExactJson(['data' => ['city' => 'Dakar', 'searches_7d' => 200]]);
    }

    public function test_sans_ville_et_sans_aucune_recherche_la_ville_par_defaut_sort_sans_chiffre(): void
    {
        // Une saisie qui ne nomme aucune ville du référentiel ne fait pas une ville.
        $this->recherches(['city' => 'Atlantide'], 900);

        $this->lire(null)->assertOk()->assertExactJson(['data' => ['city' => 'Dakar', 'searches_7d' => null]]);
    }

    // --- AC2 : la forme, la validation, la route -----------------------------------------------------------------------

    public function test_la_reponse_ne_porte_que_la_ville_et_le_chiffre(): void
    {
        $this->recherches(['city' => 'Dakar', 'type' => 'apartment', 'location' => 'Mermoz'], 400);

        $donnees = $this->lire()->assertOk()->json();
        $this->assertSame(['data'], array_keys($donnees));
        $this->assertSame(['city', 'searches_7d'], array_keys($donnees['data']));
    }

    public function test_une_ville_hors_du_referentiel_rend_422(): void
    {
        $this->lire('Atlantide')->assertStatus(422)->assertJsonValidationErrors('city');
        $this->lire(str_repeat('a', 121))->assertStatus(422)->assertJsonValidationErrors('city');
    }

    public function test_la_route_est_publique_et_sous_le_limiteur_des_lectures_publiques(): void
    {
        $route = Route::getRoutes()->getByName('public.publish.demand');
        $this->assertNotNull($route);
        $this->assertContains('throttle:public-read', $route->gatherMiddleware());
        $this->assertNotContains('auth:sanctum', $route->gatherMiddleware());
    }

    // --- Le cache d'une heure ------------------------------------------------------------------------------------------

    public function test_le_chiffre_est_garde_une_heure_puis_relu(): void
    {
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->recherches(['city' => 'Dakar'], 200);
        $this->lire()->assertJsonPath('data.searches_7d', 200);

        $this->recherches(['city' => 'Dakar'], 300);
        $this->travel(59)->minutes();
        $this->lire()->assertJsonPath('data.searches_7d', 200);

        $this->travel(2)->minutes();
        $this->lire()->assertJsonPath('data.searches_7d', 500);
    }

    public function test_le_cache_est_par_ville_validee_jamais_par_la_saisie(): void
    {
        $this->recherches(['city' => 'Dakar'], 200);
        $this->recherches(['city' => 'Thiès'], 900);

        $this->lire('dakar')->assertJsonPath('data.searches_7d', 200);
        $this->lire('Thiès')->assertJsonPath('data.searches_7d', 900);
        // Deux écritures de la même ville lisent la même entrée.
        $this->recherches(['city' => 'Dakar'], 100);
        $this->lire('DAKAR')->assertJsonPath('data.searches_7d', 200);
    }
}
