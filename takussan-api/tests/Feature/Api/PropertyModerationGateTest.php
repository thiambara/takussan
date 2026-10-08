<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §5, AC13) — la modération d'agence s'applique à TOUTES les voies de mise en
 * ligne, pas seulement à la création.
 *
 * Avant : `PropertyObserver::creating` seul la portait. Un brouillon publié par
 * `POST …/publish`, `PUT …/status` ou `PUT …/{id}` passait `available` et public sans validation.
 */
class PropertyModerationGateTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create(['moderation_required' => true]);
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);
        $this->admin = User::factory()->create();
        $this->materializeRoleProfile($this->admin, 'agency_admin', $this->agency);
    }

    private function draft(PropertyStatus $status = PropertyStatus::Draft, array $attributes = []): Property
    {
        return Property::factory()->create(array_merge([
            'agency_id' => $this->agency->id,
            'user_id' => $this->agent->id,
            'status' => $status,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
            'is_test' => false,
        ], $attributes));
    }

    private function assertQueuedNotPublic(Property $property): void
    {
        $property->refresh();
        $this->assertSame(PropertyStatus::PendingReview, $property->status);
        $this->assertNotNull($property->submitted_at);

        $this->app['auth']->forgetGuards();
        $public = collect($this->getJson('/api/public/properties?per_page=100')->assertOk()->json('data'))->pluck('id');
        $this->assertNotContains($property->id, $public->all());
        $this->getJson("/api/public/properties/{$property->slug}")->assertNotFound();

        $this->actingAsApi($this->admin);
        $queue = collect($this->getJson('/api/properties/moderation?per_page=100')->assertOk()->json('data'))->pluck('id');
        $this->assertContains($property->id, $queue->all());
    }

    public function test_publish_lands_in_pending_review_then_the_admin_approves(): void
    {
        $property = $this->draft();

        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$property->id}/publish")
            ->assertOk()
            ->assertJsonPath('data.status', PropertyStatus::PendingReview->value);
        $this->assertQueuedNotPublic($property);

        $this->actingAsApi($this->admin);
        $this->postJson("/api/properties/{$property->id}/approve")->assertOk();
        $this->assertSame(PropertyStatus::Available, $property->refresh()->status);

        $this->app['auth']->forgetGuards();
        $this->getJson("/api/public/properties/{$property->slug}")->assertOk();
    }

    public function test_put_status_and_full_put_take_the_same_path(): void
    {
        $byStatus = $this->draft();
        $byPut = $this->draft();

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$byStatus->id}/status", ['status' => 'available'])->assertOk();
        $this->assertQueuedNotPublic($byStatus);

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$byPut->id}", ['status' => 'available'])->assertOk();
        $this->assertQueuedNotPublic($byPut);
    }

    public function test_rejected_and_pending_review_listings_stay_pending_review(): void
    {
        $rejected = $this->draft(PropertyStatus::Rejected);
        $submittedAt = now()->subDays(3)->startOfSecond();
        $pending = $this->draft(PropertyStatus::PendingReview, ['submitted_at' => $submittedAt]);

        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$rejected->id}/publish")->assertOk();
        $this->assertQueuedNotPublic($rejected);

        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$pending->id}/publish")->assertOk();
        $this->assertQueuedNotPublic($pending);
        // La file garde son ordre : resoumettre ce qui attend déjà ne le renvoie pas en queue.
        $this->assertTrue($pending->refresh()->submitted_at->equalTo($submittedAt));
    }

    /** Témoin : sans modération, la même publication met le bien en ligne. */
    public function test_without_moderation_required_publish_goes_online(): void
    {
        $this->agency->update(['moderation_required' => false]);
        $property = $this->draft();

        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$property->id}/publish")
            ->assertOk()
            ->assertJsonPath('data.status', PropertyStatus::Available->value);
    }

    /** Un retour d'archive n'est pas une activation : il ne repasse pas par la file. */
    public function test_unarchiving_is_not_an_activation(): void
    {
        $property = $this->draft(PropertyStatus::Archived);

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}/status", ['status' => 'available'])->assertOk();
        $this->assertSame(PropertyStatus::Available, $property->refresh()->status);
    }
}
