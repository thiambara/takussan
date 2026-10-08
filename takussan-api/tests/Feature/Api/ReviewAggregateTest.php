<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §6, AC12) — la moyenne et le nombre d'avis STOCKÉS d'une agence ne comptent
 * que les avis publiés, et suivent chaque approbation ou rejet.
 *
 * Avant : le recompte ne se faisait qu'à la création et à la suppression, sur TOUS les avis — un
 * avis 1 en attente faisait tomber la moyenne à 3.0 ; l'approuver ou le rejeter ne changeait rien.
 */
class ReviewAggregateTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_the_agency_average_counts_only_published_reviews_and_follows_each_decision(): void
    {
        Notification::fake();
        RateLimiter::clear('public:report:127.0.0.1');

        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        $super = User::factory()->create();
        $this->materializeRoleProfile($super, 'super_admin');

        $five = Review::factory()->create([
            'reviewable_type' => Agency::class, 'reviewable_id' => $agency->id,
            'rating' => 5, 'status' => ReviewStatus::Approved, 'is_approved' => true,
        ]);
        $one = Review::factory()->create([
            'reviewable_type' => Agency::class, 'reviewable_id' => $agency->id,
            'rating' => 1, 'status' => ReviewStatus::Pending, 'is_approved' => false,
        ]);

        $this->assertAggregate($admin, $agency, 5.0, 1);

        $this->actingAsApi($super);
        $this->postJson("/api/reviews/{$one->id}/approve")->assertOk();
        $this->assertAggregate($admin, $agency, 3.0, 2);

        $this->actingAsApi($super);
        $this->postJson("/api/reviews/{$five->id}/reject")->assertOk();
        $this->assertAggregate($admin, $agency, 1.0, 1);

        // Un signalement anonyme range l'avis dans la file : il ne touche pas la moyenne.
        $this->app['auth']->forgetGuards();
        $this->postJson("/api/public/reviews/{$one->id}/report", ['reason' => 'Faux'])->assertOk();
        $this->assertSame(ReviewStatus::Reported, $one->refresh()->status);
        $this->assertAggregate($admin, $agency, 1.0, 1);
    }

    private function assertAggregate(User $viewer, Agency $agency, float $average, int $count): void
    {
        $this->actingAsApi($viewer);
        $response = $this->getJson("/api/agencies/{$agency->id}")->assertOk();

        $this->assertEquals($average, $response->json('data.average_rating'));
        $this->assertSame($count, $response->json('data.reviews_count'));
    }
}
