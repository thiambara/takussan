<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §3, AC8) — noter un agent, sur preuve.
 *
 * Avant : aucune route. La fiche publique d'un agent affichait des avis qu'aucun client ne pouvait
 * déposer.
 */
class AgentReviewTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $client;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create(['username' => 'agent-x', 'status' => 'active']);
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
        $this->client = User::factory()->create();
        $this->property = Property::factory()->published()->create(['agency_id' => $this->agency->id]);
    }

    private function completedVisit(?User $agent = null): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => $this->property->id,
            'visitor_id' => $this->client->id,
            'agent_id' => ($agent ?? $this->agent)->id,
            'status' => VisitStatus::Completed,
            'completed_at' => now(),
        ]);
    }

    private function rate(User $author, User $agent): TestResponse
    {
        $this->actingAsApi($author);

        return $this->postJson("/api/agents/{$agent->id}/reviews", ['rating' => 5, 'title' => 'Top', 'content' => 'Visite claire.']);
    }

    public function test_a_client_with_a_completed_visit_rates_the_agent_and_it_shows_once_approved(): void
    {
        $visit = $this->completedVisit();

        $this->rate($this->client, $this->agent)->assertCreated();

        $review = Review::query()->latest('id')->firstOrFail();
        $this->assertSame(User::class, $review->reviewable_type);
        $this->assertSame($this->agent->id, $review->reviewable_id);
        $this->assertSame(PropertyVisit::class, $review->context_type);
        $this->assertSame($visit->id, $review->context_id);
        $this->assertSame($this->agency->id, $review->agency_id, 'modéré par l\'agence du bien visité');
        $this->assertSame(ReviewStatus::Pending, $review->status);

        $this->app['auth']->forgetGuards();
        $this->assertSame(0, $this->getJson('/api/public/agents/agent-x')->assertOk()->json('data.reviews.count'));

        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);
        $this->actingAsApi($admin);
        $this->postJson("/api/reviews/{$review->id}/approve")->assertOk();

        $this->app['auth']->forgetGuards();
        $public = $this->getJson('/api/public/agents/agent-x')->assertOk();
        $this->assertSame(1, $public->json('data.reviews.count'));
        $this->assertSame($review->id, $public->json('data.reviews.recent.0.id'));
    }

    public function test_a_lease_on_a_property_the_agent_published_is_a_proof_too(): void
    {
        $published = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->agent->id]);
        Lease::factory()->create([
            'property_id' => $published->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $this->client->id])->id,
            'status' => LeaseStatus::Active,
        ]);

        $this->rate($this->client, $this->agent)->assertCreated();
        $this->assertSame(Lease::class, Review::query()->latest('id')->value('context_type'));
    }

    public function test_without_visit_nor_lease_it_is_403_and_an_agent_rating_themself_is_403(): void
    {
        $this->rate($this->client, $this->agent)->assertForbidden();

        // Une visite menée par UN AUTRE agent ne prouve rien pour celui-ci.
        $other = User::factory()->create();
        $this->materializeRoleProfile($other, 'agent', $this->agency);
        $this->completedVisit($other);
        $this->rate($this->client, $this->agent)->assertForbidden();

        // Une visite non terminée non plus.
        PropertyVisit::factory()->create([
            'property_id' => $this->property->id, 'visitor_id' => $this->client->id,
            'agent_id' => $this->agent->id, 'status' => VisitStatus::Confirmed,
        ]);
        $this->rate($this->client, $this->agent)->assertForbidden();

        // Se noter soi-même, même avec une « preuve » où il est visiteur et agent.
        PropertyVisit::factory()->create([
            'property_id' => $this->property->id, 'visitor_id' => $this->agent->id,
            'agent_id' => $this->agent->id, 'status' => VisitStatus::Completed,
        ]);
        $this->rate($this->agent, $this->agent)->assertForbidden();

        $this->assertSame(0, Review::query()->count());
    }

    public function test_403_comes_before_422_and_a_second_review_is_422(): void
    {
        $this->actingAsApi($this->client);
        $this->postJson("/api/agents/{$this->agent->id}/reviews", ['rating' => 99])->assertForbidden();

        $this->completedVisit();
        $this->postJson("/api/agents/{$this->agent->id}/reviews", ['rating' => 99])->assertStatus(422);
        $this->rate($this->client, $this->agent)->assertCreated();
        $this->rate($this->client, $this->agent)->assertStatus(422)->assertJsonPath('code', 'review.agent_already_reviewed');
        $this->assertSame(1, Review::query()->count());
    }
}
