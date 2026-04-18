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
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
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
        Role::findOrCreate('admin');
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $admin->assignRole('admin');
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
}
