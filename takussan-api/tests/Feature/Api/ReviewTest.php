<?php

namespace Tests\Feature\Api;

use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReviewTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_post_review_on_property(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$property->id}/reviews", [
            'rating' => 5,
            'title' => 'Excellent',
            'content' => 'Propriété géniale',
        ])->assertCreated()
            ->assertJsonPath('data.rating', 5)
            ->assertJsonPath('data.is_approved', false);
    }

    public function test_only_approved_reviews_are_listed(): void
    {
        $property = Property::factory()->create();
        Review::factory()->for($property, 'reviewable')->create(['is_approved' => true]);
        Review::factory()->for($property, 'reviewable')->create(['is_approved' => false]);

        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/properties/{$property->id}/reviews")
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_owner_replies_to_review(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $user->id]);
        $review = Review::factory()->for($property, 'reviewable')->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/reviews/{$review->id}/reply", [
            'reply_content' => 'Merci pour votre retour!',
        ])->assertOk()
            ->assertJsonPath('data.reply_content', 'Merci pour votre retour!');
    }
}
