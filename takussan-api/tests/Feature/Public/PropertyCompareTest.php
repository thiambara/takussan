<?php

namespace Tests\Feature\Public;

use App\Http\Controllers\Public\PublicPropertyController;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-082 (/compare) et TCK-100 (/by-ids, le carrousel « vus récemment ») — deux routes publiques au
 * même contrat : ordre demandé, brouillons et inconnus écartés en silence, `ids` requis, méta complète
 * même vide. Seul le plafond diffère. TCK-3017 : ex-PropertyByIdsTest, le contrat joué sur les deux
 * routes (chacune a son code dans le contrôleur).
 */
class PropertyCompareTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{0: string, 1: int}> */
    public static function routes(): array
    {
        return [
            'compare' => ['/api/public/properties/compare', PublicPropertyController::COMPARE_MAX_IDS],
            'by-ids' => ['/api/public/properties/by-ids', PublicPropertyController::BY_IDS_MAX_IDS],
        ];
    }

    #[DataProvider('routes')]
    public function test_returns_requested_published_properties_in_order(string $route, int $max): void
    {
        $a = Property::factory()->published()->create();
        $b = Property::factory()->published()->create();
        $c = Property::factory()->published()->create();

        $response = $this->getJson("{$route}?ids={$c->id},{$a->id},{$b->id}");

        $response->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.id', $c->id)
            ->assertJsonPath('data.1.id', $a->id)
            ->assertJsonPath('data.2.id', $b->id);
    }

    #[DataProvider('routes')]
    public function test_draft_and_unknown_ids_are_silently_dropped(string $route, int $max): void
    {
        $published = Property::factory()->published()->create();
        $draft = Property::factory()->draft()->create();

        $response = $this->getJson("{$route}?ids={$published->id},{$draft->id},99999");

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $published->id)
            ->assertJsonPath('meta.returned_ids', [$published->id]);
    }

    #[DataProvider('routes')]
    public function test_caps_at_the_route_maximum(string $route, int $max): void
    {
        $props = Property::factory()->count($max + 2)->published()->create();
        $idsCsv = $props->pluck('id')->implode(',');

        $this->getJson("{$route}?ids={$idsCsv}")->assertOk()->assertJsonCount($max, 'data');
    }

    #[DataProvider('routes')]
    public function test_ids_parameter_is_required(string $route, int $max): void
    {
        $this->getJson($route)->assertStatus(422);
    }

    public function test_exposes_detail_fields_for_comparison(): void
    {
        $property = Property::factory()->published()->create([
            'bedrooms' => 3,
            'bathrooms' => 2,
            'area' => 120,
            'furnished' => true,
        ]);

        $response = $this->getJson("/api/public/properties/compare?ids={$property->id}");

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [[
                    'id', 'title', 'slug', 'price', 'currency',
                    'type', 'contract_type', 'rent_period',
                    'bedrooms', 'bathrooms', 'area', 'furnished',
                    'location' => ['city', 'quarter'],
                    'tags',
                ]],
            ]);
    }

    /**
     * When every parsed id is invalid (zeros / negatives / non-numeric),
     * the controller short-circuits with an empty payload. It must still
     * include `returned_ids` in meta — the frontend's useCompare reducer
     * reads that field as an array and would crash on `undefined`.
     */
    #[DataProvider('routes')]
    public function test_all_invalid_ids_return_empty_meta_with_both_keys(string $route, int $max): void
    {
        $response = $this->getJson("{$route}?ids=0,-1,abc");

        $response->assertOk()
            ->assertJsonPath('meta.requested_ids', [])
            ->assertJsonPath('meta.returned_ids', []);
    }
}
