<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use App\Models\Review;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-598 (V16) — `per_page` est borné sur les deux routes anonymes qui l'acceptaient tel quel :
 * repli dans `1..48` pour la liste, `1..50` pour les avis. Rougit sur `e3ab4a4e`.
 */
class PublicPaginationBoundsTest extends TestCase
{
    use RefreshDatabase;

    /** AC13 — la liste. */
    public function test_la_liste_publique_plafonne_per_page(): void
    {
        Property::factory()->published()->create();

        $this->getJson('/api/public/properties?per_page=1000')->assertOk()->assertJsonPath('meta.per_page', 48);
        $this->getJson('/api/public/properties?per_page=0')->assertOk()->assertJsonPath('meta.per_page', 1);
        $this->getJson('/api/public/properties?per_page=-5')->assertOk()->assertJsonPath('meta.per_page', 1);
        $this->getJson('/api/public/properties')->assertOk()->assertJsonPath('meta.per_page', 20);
    }

    /** AC13 — les avis. */
    public function test_les_avis_plafonnent_per_page(): void
    {
        $property = Property::factory()->published()->create();
        Review::factory()->create(['reviewable_id' => $property->id, 'reviewable_type' => Property::class]);

        $url = "/api/public/properties/{$property->slug}/reviews";
        $this->getJson($url.'?per_page=1000')->assertOk()->assertJsonPath('meta.per_page', 50);
        $this->getJson($url.'?per_page=0')->assertOk()->assertJsonPath('meta.per_page', 1);
        $this->getJson($url)->assertOk()->assertJsonPath('meta.per_page', 10);
    }
}
