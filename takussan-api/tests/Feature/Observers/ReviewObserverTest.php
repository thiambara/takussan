<?php

namespace Tests\Feature\Observers;

use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReviewObserverTest extends TestCase
{
    use RefreshDatabase;

    public function test_creating_review_updates_reviewable_stats(): void
    {
        $property = Property::factory()->create([
            'reviews_count' => 0,
            'average_rating' => null,
        ]);

        $author = User::factory()->create();

        Review::factory()->create([
            'reviewable_id' => $property->id,
            'reviewable_type' => Property::class,
            'author_id' => $author->id,
            'rating' => 4,
        ]);

        $property->refresh();

        $this->assertEquals(1, $property->reviews_count);
        $this->assertEquals(4.00, $property->average_rating);

        Review::factory()->create([
            'reviewable_id' => $property->id,
            'reviewable_type' => Property::class,
            'author_id' => $author->id,
            'rating' => 5,
        ]);

        $property->refresh();

        $this->assertEquals(2, $property->reviews_count);
        $this->assertEquals(4.50, $property->average_rating);
    }

    public function test_deleting_review_updates_reviewable_stats(): void
    {
        $property = Property::factory()->create();
        $author = User::factory()->create();

        $review1 = Review::factory()->create([
            'reviewable_id' => $property->id,
            'reviewable_type' => Property::class,
            'author_id' => $author->id,
            'rating' => 4,
        ]);

        $review2 = Review::factory()->create([
            'reviewable_id' => $property->id,
            'reviewable_type' => Property::class,
            'author_id' => $author->id,
            'rating' => 2,
        ]);

        $property->refresh();
        $this->assertEquals(2, $property->reviews_count);
        $this->assertEquals(3.00, $property->average_rating);

        $review2->delete();

        $property->refresh();
        $this->assertEquals(1, $property->reviews_count);
        $this->assertEquals(4.00, $property->average_rating);

        $review1->delete();

        $property->refresh();
        $this->assertEquals(0, $property->reviews_count);
        $this->assertNull($property->average_rating);
    }
}
