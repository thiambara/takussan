<?php

namespace Tests\Feature\Public;

use App\Models\Customer;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyReviewEligibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_anonymous_user_receives_not_eligible_payload(): void
    {
        $property = Property::factory()->published()->create();

        $this->getJson("/api/public/properties/{$property->slug}/review-eligibility")
            ->assertOk()
            ->assertJsonPath('data.eligible', false)
            ->assertJsonPath('data.reason', 'none')
            ->assertJsonPath('data.already_reviewed', false);
    }

    public function test_user_with_completed_visit_is_eligible_to_review(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->published()->create();
        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => $user->id,
            'status' => VisitStatus::Completed,
            'completed_at' => now(),
        ]);
        Sanctum::actingAs($user);

        $this->getJson("/api/public/properties/{$property->slug}/review-eligibility")
            ->assertOk()
            ->assertJsonPath('data.eligible', true)
            ->assertJsonPath('data.reason', 'visit')
            ->assertJsonPath('data.already_reviewed', false);
    }

    public function test_user_with_lease_is_eligible_to_review(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $property = Property::factory()->published()->create();
        Lease::factory()->active()->create([
            'property_id' => $property->id,
            'tenant_id' => $customer->id,
        ]);
        Sanctum::actingAs($user);

        $this->getJson("/api/public/properties/{$property->slug}/review-eligibility")
            ->assertOk()
            ->assertJsonPath('data.eligible', true)
            ->assertJsonPath('data.reason', 'lease');
    }

    public function test_existing_review_is_reported_in_eligibility_payload(): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $property = Property::factory()->published()->create();
        Lease::factory()->active()->create([
            'property_id' => $property->id,
            'tenant_id' => $customer->id,
        ]);
        Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $property->id,
            'author_id' => $user->id,
        ]);
        Sanctum::actingAs($user);

        $this->getJson("/api/public/properties/{$property->slug}/review-eligibility")
            ->assertOk()
            ->assertJsonPath('data.eligible', true)
            ->assertJsonPath('data.reason', 'lease')
            ->assertJsonPath('data.already_reviewed', true);
    }

    public function test_unrelated_user_is_not_eligible_to_review(): void
    {
        $property = Property::factory()->published()->create();
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/public/properties/{$property->slug}/review-eligibility")
            ->assertOk()
            ->assertJsonPath('data.eligible', false)
            ->assertJsonPath('data.reason', 'none')
            ->assertJsonPath('data.already_reviewed', false);
    }
}
