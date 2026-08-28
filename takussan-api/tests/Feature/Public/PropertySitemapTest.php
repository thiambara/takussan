<?php

namespace Tests\Feature\Public;

use App\Http\Controllers\Public\PublicPropertyController;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-431 — `GET /api/public/properties/sitemap` : l'énumération du catalogue INDEXABLE.
 *
 * Ce que ces tests gardent, et qui ne se lit pas dans la signature :
 *
 * · **le segment littéral n'est pas avalé par `properties/{slug}`** — l'ordre des routes est le
 *   seul obstacle, et son inversion ne produit pas une erreur mais un 404 sur une fiche
 *   introuvable nommée « sitemap » ;
 * · **rien de non public n'y entre** — un sitemap qui annonce des URL rendant 404 est pire que
 *   pas de sitemap ;
 * · **`per_page` est plafonné**, contrairement à `index()`.
 */
class PropertySitemapTest extends TestCase
{
    use RefreshDatabase;

    public function test_lists_published_properties_with_slug_and_updated_at(): void
    {
        $property = Property::factory()->published()->create();

        $response = $this->getJson('/api/public/properties/sitemap');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [['slug', 'updated_at']],
                'meta' => ['total', 'per_page', 'current_page', 'last_page'],
            ])
            ->assertJsonPath('data.0.slug', $property->slug)
            ->assertJsonPath('meta.total', 1);
    }

    public function test_emits_only_two_keys_per_entry(): void
    {
        // Le point de l'endpoint : `PropertyResource` en émet 47 et charge `address` et `media`.
        // Si quelqu'un le remplaçait par la ressource complète « pour réutiliser », l'énumération
        // du catalogue entier redeviendrait un téléchargement du catalogue entier.
        Property::factory()->published()->create();

        $response = $this->getJson('/api/public/properties/sitemap');

        $this->assertSame(['slug', 'updated_at'], array_keys($response->json('data.0')));
    }

    public function test_updated_at_is_iso_8601_with_offset(): void
    {
        // ADR-0018 : `<lastmod>` attend une date ISO. Une chaîne SQL brute (`2026-08-25 09:12:00`)
        // serait lue comme une heure LOCALE par le navigateur, et n'est pas un `<lastmod>` valide.
        Property::factory()->published()->create();

        $response = $this->getJson('/api/public/properties/sitemap');

        $this->assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/',
            $response->json('data.0.updated_at'),
        );
    }

    public function test_route_is_not_swallowed_by_the_slug_route(): void
    {
        // Le piège que le commentaire de `discovery` signale déjà : sous `properties/{slug}`, ce
        // chemin rendrait 404 « bien introuvable » et non une liste. On le constate par la FORME
        // de la réponse, la seule chose qui distingue les deux.
        Property::factory()->published()->create();

        $response = $this->getJson('/api/public/properties/sitemap');

        $response->assertOk();
        $this->assertIsArray($response->json('data'));
        $this->assertArrayHasKey('last_page', $response->json('meta'));
    }

    /**
     * @return array<string, array{PropertyStatus|PropertyVisibility|bool|null, string}>
     */
    public static function nonPublicProvider(): array
    {
        return [
            'brouillon' => [PropertyStatus::Draft, 'status'],
            'vendu' => [PropertyStatus::Sold, 'status'],
            'loué' => [PropertyStatus::Rented, 'status'],
            'archivé' => [PropertyStatus::Archived, 'status'],
            'en attente de modération' => [PropertyStatus::PendingReview, 'status'],
            'rejeté' => [PropertyStatus::Rejected, 'status'],
            'privé' => [PropertyVisibility::Private, 'visibility'],
        ];
    }

    #[DataProvider('nonPublicProvider')]
    public function test_excludes_everything_scope_public_excludes(mixed $valeur, string $colonne): void
    {
        Property::factory()->published()->create([$colonne => $valeur]);

        $this->getJson('/api/public/properties/sitemap')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_excludes_unpublished_and_test_properties(): void
    {
        Property::factory()->published()->create(['published_at' => null]);
        Property::factory()->published()->create(['is_test' => true]);

        $this->getJson('/api/public/properties/sitemap')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_per_page_is_capped(): void
    {
        // `index()` accepte n'importe quelle valeur. Sur une route anonyme qui énumère tout le
        // catalogue, ce serait une invitation à le demander d'un coup.
        Property::factory()->count(3)->published()->create();

        $response = $this->getJson('/api/public/properties/sitemap?per_page=999999');

        $response->assertOk()
            ->assertJsonPath('meta.per_page', PublicPropertyController::SITEMAP_MAX_PER_PAGE);
    }

    public function test_per_page_below_one_falls_back_to_one(): void
    {
        Property::factory()->count(3)->published()->create();

        $this->getJson('/api/public/properties/sitemap?per_page=0')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 1)
            ->assertJsonCount(1, 'data');
    }

    public function test_pagination_is_total_and_stable_across_pages(): void
    {
        // `index()` trie par `featured` puis `published_at`, deux colonnes NON uniques : sous
        // PostgreSQL, deux pages d'un tel tri peuvent rendre deux fois la même ligne. Ici l'ordre
        // départage toutes les lignes, donc l'union des pages est exactement le catalogue.
        $slugs = Property::factory()->count(5)->published()->create()->pluck('slug')->sort()->values();

        $vus = [];
        for ($page = 1; $page <= 5; $page++) {
            $reponse = $this->getJson("/api/public/properties/sitemap?per_page=1&page={$page}");
            $reponse->assertOk()->assertJsonPath('meta.last_page', 5);
            $vus[] = $reponse->json('data.0.slug');
        }

        $this->assertSame($slugs->all(), collect($vus)->sort()->values()->all());
        $this->assertCount(5, array_unique($vus));
    }

    public function test_no_auth_required(): void
    {
        $this->getJson('/api/public/properties/sitemap')->assertOk();
    }
}
