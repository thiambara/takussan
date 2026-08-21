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
    public function test_available_from_dans_le_passe_ne_rend_plus_422(): void
    {
        Property::factory()->create([
            'status' => PropertyStatus::Available,
            'visibility' => PropertyVisibility::Public,
            'available_from' => null,
            'title' => 'Toujours disponible',
            'published_at' => now(),
        ]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?available_from='.now()->subYear()->toDateString());

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
    }
}
