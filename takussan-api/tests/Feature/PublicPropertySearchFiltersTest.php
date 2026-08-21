<?php

namespace Tests\Feature;

use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-128 — floor_number and available_from filters on /public/properties/search.
 */
class PublicPropertySearchFiltersTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    // ─────────────────────────────────────────────────────────────────────
    // floor_number filter
    // ─────────────────────────────────────────────────────────────────────

    public function test_floor_number_filter_returns_matching_properties(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'floor_number' => 2,
            'title' => 'On floor 2',
            'published_at' => now(),
        ]);
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'floor_number' => 5,
            'title' => 'On floor 5',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?floor_number=2');

        $response->assertOk();
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertSame('On floor 2', $data[0]['title']);
    }

    public function test_floor_number_filter_excludes_null_floor(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'floor_number' => null,
            'title' => 'No floor',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?floor_number=1');

        $response->assertOk();
        $this->assertCount(0, $response->json('data'));
    }

    // ─────────────────────────────────────────────────────────────────────
    // available_from filter
    // ─────────────────────────────────────────────────────────────────────

    public function test_available_from_filter_includes_property_already_available(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'available_from' => now()->subMonth()->toDateString(),
            'title' => 'Already available',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?available_from='.now()->addDays(30)->toDateString());

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    public function test_available_from_filter_includes_property_with_null_available_from(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'available_from' => null,
            'title' => 'Always available',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?available_from='.now()->addDays(30)->toDateString());

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }

    public function test_available_from_filter_excludes_property_not_yet_available(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'available_from' => now()->addYear()->toDateString(),
            'title' => 'Not yet available',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?available_from='.now()->addDays(30)->toDateString());

        $response->assertOk();
        $this->assertCount(0, $response->json('data'));
    }

    public function test_invalid_available_from_returns_validation_error(): void
    {
        $response = $this->getJson('/api/public/properties/search?available_from=not-a-date');

        $response->assertUnprocessable();
    }

    // ─────────────────────────────────────────────────────────────────────
    // TCK-335 — filtres que l'interface expose et que le moteur ne recevait pas
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Le front sérialise ses booléens avec `String(v)` : il envoie la CHAÎNE
     * « true », que la règle `boolean` de Laravel refuse (elle n'accepte que
     * true/false/1/0/"1"/"0"). L'endpoint rendait donc 422 sur le filtre le
     * plus courant d'un marché locatif, et le front affichait « 0 bien trouvé ».
     *
     * @return array<string, array{0: string, 1: bool}>
     */
    public static function furnishedLitteralProvider(): array
    {
        return [
            'chaîne true' => ['true', true],
            'chaîne false' => ['false', false],
            'entier 1' => ['1', true],
            'entier 0' => ['0', false],
        ];
    }

    #[DataProvider('furnishedLitteralProvider')]
    public function test_furnished_filter_accepte_les_litteraux_du_front(string $litteral, bool $attenduMeuble): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'furnished' => true,
            'title' => 'Meublé',
            'published_at' => now(),
        ]);
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'furnished' => false,
            'title' => 'Nu',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?furnished='.$litteral);

        $response->assertOk();
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertSame($attenduMeuble ? 'Meublé' : 'Nu', $data[0]['title']);
    }

    /**
     * `after_or_equal:today` faisait pourrir toute recherche sauvegardée ou tout
     * lien partagé portant une date : le jour où elle passait, l'URL rendait 422.
     */
    public function test_available_from_dans_le_passe_est_ecrete_au_jour_meme(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'available_from' => null,
            'title' => 'Toujours disponible',
            'published_at' => now(),
        ]);
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'available_from' => now()->subMonth()->toDateString(),
            'title' => 'Libre depuis un mois',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $passe = $this->getJson('/api/public/properties/search?available_from='.now()->subYear()->toDateString());
        $aujourdhui = $this->getJson('/api/public/properties/search?available_from='.now()->toDateString());

        // Ne PAS se contenter du 200 : retirer `after_or_equal:today` sans écrêter
        // rendrait 200 aussi — avec les seuls biens à `available_from` NULL, soit
        // « 8 biens sur 258 » sur le jeu de démonstration. On passerait d'une erreur
        // bruyante à un mensonge discret, et l'assertion ne verrait pas la différence.
        $passe->assertOk();
        $this->assertSame(
            $aujourdhui->json('meta.total'),
            $passe->json('meta.total'),
            'une date passée doit être écrêtée au jour même, pas appliquée telle quelle',
        );
        $this->assertCount(2, $passe->json('data'));
    }

    // ─────────────────────────────────────────────────────────────────────
    // TCK-335 — surface : le filtre existait dans l'interface, pas au moteur
    // ─────────────────────────────────────────────────────────────────────

    public function test_area_min_et_area_max_bornent_la_surface(): void
    {
        foreach ([50, 250, 600] as $surface) {
            Property::factory()->create([
                'status' => PropertyStatus::Available,
                'visibility' => PropertyVisibility::Public,
                'area' => $surface,
                'title' => "Surface {$surface}",
                'published_at' => now(),
            ]);
        }
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?area_min=200&area_max=400');

        $response->assertOk();
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertSame('Surface 250', $data[0]['title']);
    }

    /**
     * `area` est nullable en base. Un bien à surface INCONNUE ne peut pas
     * satisfaire « au moins 200 m² » — on ne le promet pas. Le filtre exclut
     * donc les NULL, comme `floor_number` (test ci-dessus) et comme `price`, et
     * surtout PAS comme `available_from`, dont la clause OR-joint `IS NULL` à
     * dessein. Le jeu de démonstration ne porte aucun `area` nul : sans ce test,
     * l'écart ne se révélerait qu'en production.
     */
    public function test_area_min_exclut_les_surfaces_inconnues(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'area' => null,
            'title' => 'Surface inconnue',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?area_min=1');

        $response->assertOk();
        $this->assertCount(0, $response->json('data'));
    }

    public function test_area_min_zero_n_est_pas_confondu_avec_absent(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'area' => null,
            'title' => 'Surface inconnue',
            'published_at' => now(),
        ]);
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'area' => 40,
            'title' => 'Surface connue',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        // `area_min=0` doit AGIR (et donc écarter la surface inconnue), pas être
        // lu comme « pas de filtre ». C'est le piège de `! empty()` dans
        // buildFilter() — le défaut d'origine réintroduit sur son propre correctif.
        $response = $this->getJson('/api/public/properties/search?area_min=0');

        $response->assertOk();
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertSame('Surface connue', $data[0]['title']);
    }

    // ─────────────────────────────────────────────────────────────────────
    // TCK-335 — « en vedette » : le lien du pied de page rendait tout le catalogue
    // ─────────────────────────────────────────────────────────────────────

    public function test_featured_true_ne_rend_que_les_biens_en_vedette(): void
    {
        Property::factory()->featured()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'title' => 'Coup de cœur',
            'published_at' => now(),
        ]);
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'featured' => false,
            'title' => 'Ordinaire',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?featured=true');

        $response->assertOk();
        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertSame('Coup de cœur', $data[0]['title']);
    }

    /**
     * `featured` est UNILATÉRAL, et c'est un alignement, pas une commodité :
     * `PublicPropertyController::index()` traite déjà ce paramètre par
     * `$request->boolean('featured')` sur la même surface publique. Deux
     * endpoints qui portent le même mot doivent rendre le même compte, sans quoi
     * `/public/properties?featured=false` et `/public/properties/search?featured=false`
     * divergent sur la même donnée. L'interface, elle, n'offre qu'une bascule
     * « en vedette uniquement » — le « non-vedette » n'existe pas au produit.
     */
    public function test_featured_false_ne_filtre_rien_comme_sur_index(): void
    {
        Property::factory()->featured()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'published_at' => now(),
        ]);
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'featured' => false,
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $recherche = $this->getJson('/api/public/properties/search?featured=false');
        $liste = $this->getJson('/api/public/properties?featured=false');

        $recherche->assertOk();
        $this->assertCount(2, $recherche->json('data'));
        $this->assertCount(2, $liste->json('data'));
    }
}
