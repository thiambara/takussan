<?php

namespace Tests\Feature\Api;

use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use App\Support\VisitorFingerprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §6, AC6) — signaler un avis sans compte.
 *
 * Avant : seule la route authentifiée existait ; le visiteur du site public ne pouvait rien
 * signaler, et le seuil lisait un réglage `config('takussan.reviews.report_threshold')` qu'aucun
 * fichier ne déclarait.
 */
class PublicReportTest extends ApiTestCase
{
    use RefreshDatabase;

    private Property $property;

    private Review $five;

    private Review $three;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('public:report:127.0.0.1');

        $this->property = Property::factory()->published()->create(['is_test' => false]);
        $this->five = $this->approved(5);
        $this->three = $this->approved(3);
    }

    private function approved(int $rating): Review
    {
        return Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $this->property->id,
            'rating' => $rating,
            'status' => ReviewStatus::Approved,
            'is_approved' => true,
        ]);
    }

    private function publicReviews(): TestResponse
    {
        return $this->getJson("/api/public/properties/{$this->property->slug}/reviews")->assertOk();
    }

    public function test_an_anonymous_report_is_recorded_and_moves_neither_the_listing_nor_the_average(): void
    {
        $this->assertEquals(4.0, $this->publicReviews()->json('meta.average'));

        $this->postJson("/api/public/reviews/{$this->three->id}/report", ['reason' => 'Faux avis'])
            ->assertOk();

        $review = $this->three->refresh();
        $this->assertSame(ReviewStatus::Reported, $review->status);
        $this->assertTrue($review->is_approved);
        $this->assertSame(1, $review->reported_count);
        $this->assertNull($review->metadata['reports'][0]['user_id']);
        $this->assertSame(VisitorFingerprint::ofIp('127.0.0.1'), $review->metadata['reports'][0]['fingerprint']);
        $this->assertArrayNotHasKey('ip', $review->metadata['reports'][0]);

        $public = $this->publicReviews();
        $this->assertContains($this->three->id, collect($public->json('data'))->pluck('id')->all(), 'l\'avis signalé reste publié');
        $this->assertEquals(4.0, $public->json('meta.average'), 'la moyenne ne bouge pas');
    }

    public function test_the_same_visitor_reporting_twice_counts_once(): void
    {
        $url = "/api/public/reviews/{$this->five->id}/report";

        $this->withHeader('X-Forwarded-For', '203.0.113.9')->postJson($url, ['reason' => 'Spam'])->assertOk();
        $this->withHeader('X-Forwarded-For', '203.0.113.9')->postJson($url, ['reason' => 'Spam encore'])->assertOk();
        $this->assertSame(1, $this->five->refresh()->reported_count);

        $this->withHeader('X-Forwarded-For', '203.0.113.10')->postJson($url, ['reason' => 'Spam'])->assertOk();
        $this->assertSame(2, $this->five->refresh()->reported_count);
    }

    public function test_a_filled_honeypot_answers_204_and_records_nothing(): void
    {
        $this->postJson("/api/public/reviews/{$this->five->id}/report", ['reason' => 'x', 'company' => 'Bot'])
            ->assertNoContent();

        $this->assertSame(0, $this->five->refresh()->reported_count);
        $this->assertSame(ReviewStatus::Approved, $this->five->status);
    }

    public function test_a_bearer_token_attaches_the_account_and_dedupes_by_account(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('report')->plainTextToken;
        $url = "/api/public/reviews/{$this->five->id}/report";

        $this->withHeaders(['Authorization' => "Bearer {$token}", 'X-Forwarded-For' => '203.0.113.1'])
            ->postJson($url, ['reason' => 'Spam'])->assertOk();
        $this->withHeaders(['Authorization' => "Bearer {$token}", 'X-Forwarded-For' => '203.0.113.2'])
            ->postJson($url, ['reason' => 'Spam'])->assertOk();

        $review = $this->five->refresh();
        $this->assertSame(1, $review->reported_count);
        $this->assertSame($user->id, $review->metadata['reports'][0]['user_id']);
    }

    public function test_an_unpublished_review_cannot_be_reported_publicly(): void
    {
        $pending = Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $this->property->id,
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ]);

        $this->postJson("/api/public/reviews/{$pending->id}/report", ['reason' => 'x'])->assertNotFound();
        $this->assertSame(0, $pending->refresh()->reported_count);
    }

    /** La route authentifiée partage la règle : même compte, deux envois, une unité. */
    public function test_the_authenticated_route_shares_the_rule(): void
    {
        $user = User::factory()->create();
        $this->actingAsApi($user);

        $this->postJson("/api/reviews/{$this->five->id}/report", ['reason' => 'Spam'])->assertOk();
        $this->postJson("/api/reviews/{$this->five->id}/report", ['reason' => 'Spam'])->assertOk();

        $review = $this->five->refresh();
        $this->assertSame(1, $review->reported_count);
        $this->assertSame(ReviewStatus::Reported, $review->status);
    }

    /**
     * verif-597 m3 — la route AUTHENTIFIÉE refuse aussi un avis non publié. Avant, elle rendait 200
     * et le faisait passer `pending → reported` : un oracle d'existence sur les identifiants, et un
     * avis encore en attente qui changeait de statut.
     */
    public function test_an_unpublished_review_cannot_be_reported_by_an_account_either(): void
    {
        $pending = Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $this->property->id,
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
        ]);
        $this->actingAsApi(User::factory()->create());

        $this->postJson("/api/reviews/{$pending->id}/report", ['reason' => 'spam'])->assertNotFound();

        $pending->refresh();
        $this->assertSame(ReviewStatus::Pending, $pending->status);
        $this->assertSame(0, $pending->reported_count);
    }
}
