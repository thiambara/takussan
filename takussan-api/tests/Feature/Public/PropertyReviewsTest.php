<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyReviewsTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_approved_reviews_with_meta(): void
    {
        $property = Property::factory()->published()->create();
        $author = User::factory()->create();

        Review::factory()->count(3)->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $property->id,
            'author_id' => $author->id,
            'rating' => 5,
            'is_approved' => true,
            'approved_at' => now(),
        ]);
        Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $property->id,
            'author_id' => $author->id,
            'rating' => 3,
            'is_approved' => true,
            'approved_at' => now(),
        ]);
        Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $property->id,
            'author_id' => $author->id,
            'rating' => 1,
            'is_approved' => false,
        ]);

        $response = $this->getJson("/api/public/properties/{$property->slug}/reviews");

        $response->assertOk()->assertJsonStructure([
            'data' => [['id', 'rating', 'author' => ['id', 'name', 'avatar_url']]],
            'meta' => ['total', 'current_page', 'average', 'distribution' => ['5', '4', '3', '2', '1']],
        ]);

        $this->assertSame(4, $response->json('meta.total'));
        $this->assertSame(4.5, $response->json('meta.average'));
        $this->assertSame(3, $response->json('meta.distribution.5'));
        $this->assertSame(1, $response->json('meta.distribution.3'));
    }

    public function test_returns_404_for_unknown_slug(): void
    {
        $this->getJson('/api/public/properties/unknown-slug/reviews')->assertNotFound();
    }

    public function test_excludes_unapproved_reviews(): void
    {
        $property = Property::factory()->published()->create();
        $author = User::factory()->create();

        Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $property->id,
            'author_id' => $author->id,
            'rating' => 5,
            'is_approved' => false,
        ]);

        $response = $this->getJson("/api/public/properties/{$property->slug}/reviews");

        $response->assertOk()->assertJsonCount(0, 'data');
        $this->assertSame(0, $response->json('meta.total'));
    }
}
