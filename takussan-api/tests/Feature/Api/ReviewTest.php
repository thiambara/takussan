<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
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
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'status' => BookingStatus::Completed,
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$property->id}/reviews", [
            'rating' => 5,
            'title' => 'Excellent',
            'content' => 'Propriété géniale',
        ])->assertCreated()
            ->assertJsonPath('data.rating', 5)
            ->assertJsonPath('data.is_approved', false);
    }

    public function test_user_without_booking_or_lease_cannot_review(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$property->id}/reviews", [
            'rating' => 5,
            'content' => 'nope',
        ])->assertForbidden();
    }

    public function test_duplicate_review_is_rejected(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'status' => BookingStatus::Completed,
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$property->id}/reviews", ['rating' => 4])->assertCreated();
        $this->postJson("/api/properties/{$property->id}/reviews", ['rating' => 5])
            ->assertStatus(422);
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

    public function test_non_admin_cannot_approve_review(): void
    {
        $review = Review::factory()->create(['is_approved' => false]);
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/reviews/{$review->id}/approve")->assertForbidden();
    }

    public function test_admin_can_approve_review(): void
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        Role::findOrCreate('super_admin', 'web');
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        app(PermissionRegistrar::class)->setPermissionsTeamId(null);
        $admin->assignRole('super_admin');
        $review = Review::factory()->create(['is_approved' => false]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/reviews/{$review->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.is_approved', true);
    }

    public function test_rating_below_1_returns_422(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $property = Property::factory()->create();
        $property->bookings()->create([
            'customer_id' => $customer->id,
            'created_by_id' => $user->id,
            'total_amount' => 100000,
            'status' => BookingStatus::Completed,
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$property->id}/reviews", ['rating' => 0])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['rating']);
    }

    public function test_rating_above_5_returns_422(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $property = Property::factory()->create();
        $property->bookings()->create([
            'customer_id' => $customer->id,
            'created_by_id' => $user->id,
            'total_amount' => 100000,
            'status' => BookingStatus::Completed,
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/properties/{$property->id}/reviews", ['rating' => 6])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['rating']);
    }

    /**
     * TCK-078 — the owner (or an admin) can retract a reply they previously
     * published. The review itself remains; only the reply columns are
     * wiped so the public view reverts to the unanswered state.
     */
    public function test_owner_can_delete_reply_on_own_property_review(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $review = Review::factory()->create([
            'reviewable_id' => $property->id,
            'reviewable_type' => Property::class,
            'reply_content' => 'Thanks!',
            'replied_by_id' => $owner->id,
            'replied_at' => now(),
        ]);

        Sanctum::actingAs($owner);

        $this->deleteJson("/api/reviews/{$review->id}/reply")
            ->assertOk()
            ->assertJsonPath('data.reply_content', null);

        $this->assertNull($review->fresh()->reply_content);
        $this->assertNull($review->fresh()->replied_by_id);
    }

    public function test_unrelated_user_cannot_delete_reply(): void
    {
        $owner = User::factory()->create();
        $outsider = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $review = Review::factory()->create([
            'reviewable_id' => $property->id,
            'reviewable_type' => Property::class,
            'reply_content' => 'Thanks!',
            'replied_by_id' => $owner->id,
            'replied_at' => now(),
        ]);

        Sanctum::actingAs($outsider);

        $this->deleteJson("/api/reviews/{$review->id}/reply")->assertForbidden();
    }

    public function test_delete_reply_returns_404_when_no_reply(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $review = Review::factory()->create([
            'reviewable_id' => $property->id,
            'reviewable_type' => Property::class,
            'reply_content' => null,
        ]);

        Sanctum::actingAs($owner);

        $this->deleteJson("/api/reviews/{$review->id}/reply")->assertNotFound();
    }

    /**
     * TCK-078 — `/app/profile/reviews` uses `filter[author_id]=me` to list
     * the current user's own reviews without needing admin privileges.
     */
    public function test_author_can_list_own_reviews_via_filter_author_id_me(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $property = Property::factory()->create([
            'title' => 'Appartement témoin',
            'slug' => 'appartement-temoin',
            'reference_number' => 'TK-TEST-236',
        ]);

        Review::factory()->create([
            'author_id' => $user->id,
            'created_at' => now()->subDay(),
        ]);
        Review::factory()->create([
            'author_id' => $user->id,
            'reviewable_type' => Property::class,
            'reviewable_id' => $property->id,
            'created_at' => now(),
        ]);
        Review::factory()->count(3)->create(['author_id' => $other->id]);

        Sanctum::actingAs($user);

        $this->getJson('/api/reviews?filter[author_id]=me')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.target.title', 'Appartement témoin')
            ->assertJsonPath('data.0.target.slug', 'appartement-temoin')
            ->assertJsonPath('data.0.target.subtitle', 'TK-TEST-236');
    }

    public function test_non_admin_without_author_filter_is_forbidden_on_reviews_index(): void
    {
        $user = User::factory()->create();
        Review::factory()->count(2)->create();

        Sanctum::actingAs($user);

        $this->getJson('/api/reviews')->assertForbidden();
    }
}
