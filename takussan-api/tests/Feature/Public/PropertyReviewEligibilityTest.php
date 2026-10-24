<?php

namespace Tests\Feature\Public;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
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

    /**
     * P201.01 (TCK-2033) — ADR-0043 § 3 : une visite finalisée n'ouvre pas l'avis du bien (elle
     * n'ouvre que celui de l'agent). La lecture d'éligibilité suit la règle du dépôt.
     */
    public function test_user_with_completed_visit_only_is_not_eligible_to_review(): void
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
            ->assertJsonPath('data.eligible', false)
            ->assertJsonPath('data.reason', 'none')
            ->assertJsonPath('data.already_reviewed', false);
    }

    /**
     * P201.01 (TCK-2033) — une seule règle juge la lecture et l'écriture : pour chaque preuve,
     * `eligible && !already_reviewed` vaut exactement « le dépôt rend 201 ».
     *
     * @return array<string, array{0: string, 1: string|null, 2: bool}>
     */
    public static function preuves(): array
    {
        $cas = ['visite finalisée' => ['visit', VisitStatus::Completed->value, false]];
        foreach (LeaseStatus::cases() as $status) {
            $cas["bail {$status->value}"] = ['lease', $status->value, false];
            $cas["bail {$status->value}, avis retiré"] = ['lease', $status->value, true];
        }
        foreach (BookingStatus::cases() as $status) {
            $cas["réservation {$status->value}"] = ['booking', $status->value, false];
        }

        return $cas;
    }

    #[DataProvider('preuves')]
    public function test_eligibility_read_matches_what_the_deposit_accepts(string $preuve, string $status, bool $avisRetire): void
    {
        $user = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $user->id]);
        $property = Property::factory()->published()->create();

        match ($preuve) {
            'visit' => PropertyVisit::factory()->create([
                'property_id' => $property->id,
                'visitor_id' => $user->id,
                'status' => $status,
                'completed_at' => now(),
            ]),
            'lease' => Lease::factory()->create([
                'property_id' => $property->id,
                'tenant_id' => $customer->id,
                'status' => $status,
            ]),
            'booking' => Booking::factory()->create([
                'property_id' => $property->id,
                'customer_id' => $customer->id,
                'status' => $status,
            ]),
        };

        if ($avisRetire) {
            Review::factory()->create([
                'reviewable_type' => Property::class,
                'reviewable_id' => $property->id,
                'author_id' => $user->id,
            ])->delete();
        }

        Sanctum::actingAs($user);

        $lu = $this->getJson("/api/public/properties/{$property->slug}/review-eligibility")
            ->assertOk()
            ->json('data');

        $depot = $this->postJson("/api/properties/{$property->id}/reviews", ['rating' => 4]);

        $this->assertSame(
            $depot->status() === 201,
            $lu['eligible'] && ! $lu['already_reviewed'],
            'lu : '.json_encode($lu).", dépôt : {$depot->status()}",
        );
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
