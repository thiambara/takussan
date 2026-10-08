<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
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

    /** Un bien APPROUVÉ qui sort d'archive revient en ligne : son approbation tient. */
    public function test_an_approved_listing_back_from_archive_goes_online(): void
    {
        $property = $this->draft();
        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$property->id}/publish")->assertOk();
        $this->actingAsApi($this->admin);
        $this->postJson("/api/properties/{$property->id}/approve")->assertOk();

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}/status", ['status' => 'archived'])->assertOk();
        $this->putJson("/api/properties/{$property->id}/status", ['status' => 'available'])->assertOk();

        $this->assertSame(PropertyStatus::Available, $property->refresh()->status);
        $this->assertNotNull($property->approved_at);
    }

    /**
     * verif-597 B1 — un bien JAMAIS approuvé qui sort d'archive va dans la file. Avant, ce test
     * s'appelait `test_unarchiving_is_not_an_activation` et AFFIRMAIT le contournement : le bien,
     * créé directement en `archived`, passait `available` sans validation.
     */
    public function test_a_never_approved_listing_back_from_archive_goes_to_the_queue(): void
    {
        $property = $this->draft(PropertyStatus::Archived);

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}/status", ['status' => 'available'])->assertOk();

        $this->assertQueuedNotPublic($property);
    }

    /**
     * verif-597 B1 — les détours de la sonde : un statut intermédiaire hors ligne ne blanchit ni
     * un brouillon, ni un bien refusé, ni un bien en file.
     *
     * @return array<string, array{PropertyStatus, string, string}>
     */
    public static function detours(): array
    {
        return [
            'draft → archived → publish' => [PropertyStatus::Draft, 'archived', 'publish'],
            'rejected → archived → publish' => [PropertyStatus::Rejected, 'archived', 'publish'],
            'draft → pending → publish' => [PropertyStatus::Draft, 'pending', 'publish'],
            'draft → unavailable → visibility public' => [PropertyStatus::Draft, 'unavailable', 'visibility'],
            'pending_review → under_maintenance → publish' => [PropertyStatus::PendingReview, 'under_maintenance', 'publish'],
        ];
    }

    #[DataProvider('detours')]
    public function test_a_detour_through_an_offline_status_does_not_skip_the_queue(PropertyStatus $from, string $via, string $then): void
    {
        $property = $this->draft($from);

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}/status", ['status' => $via])->assertOk();
        $then === 'publish'
            ? $this->postJson("/api/properties/{$property->id}/publish")->assertOk()
            : $this->putJson("/api/properties/{$property->id}/visibility", ['visibility' => 'public'])->assertOk();

        $this->assertQueuedNotPublic($property);
    }

    /** Une approbation suivie d'un refus n'est plus une approbation. */
    public function test_an_approval_followed_by_a_rejection_does_not_count(): void
    {
        $property = $this->draft(PropertyStatus::Archived, [
            'approved_at' => now()->subDays(2),
            'rejected_at' => now()->subDay(),
        ]);

        $this->actingAsApi($this->agent);
        $this->putJson("/api/properties/{$property->id}/status", ['status' => 'available'])->assertOk();

        $this->assertQueuedNotPublic($property);
    }

    /** Dépublier annule l'approbation : republier repasse par la file. */
    public function test_unpublishing_cancels_the_approval(): void
    {
        $property = $this->draft();
        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$property->id}/publish")->assertOk();
        $this->actingAsApi($this->admin);
        $this->postJson("/api/properties/{$property->id}/approve")->assertOk();

        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$property->id}/unpublish")->assertOk();
        $this->assertNull($property->refresh()->approved_at);
        $this->postJson("/api/properties/{$property->id}/publish")->assertOk();

        $this->assertQueuedNotPublic($property);
    }

    /** La copie d'un bien approuvé n'hérite pas de son approbation. */
    public function test_a_copy_of_an_approved_listing_goes_to_the_queue(): void
    {
        $source = $this->draft(PropertyStatus::Available, ['approved_at' => now()->subDay()]);

        $this->actingAsApi($this->agent);
        $cloneId = $this->postJson("/api/properties/{$source->id}/duplicate", ['copy_media' => false])
            ->assertCreated()->json('data.id');
        $clone = Property::findOrFail($cloneId);
        $this->assertNull($clone->approved_at);

        $this->postJson("/api/properties/{$cloneId}/publish")->assertOk();
        $this->assertQueuedNotPublic($clone);
    }

    /**
     * Raccord TCK-591 × verif-597 B1 — l'archivage EN LOT fournit le statut intermédiaire du
     * contournement : un bien jamais approuvé, archivé en lot puis désarchivé, va dans la file.
     */
    public function test_a_never_approved_listing_archived_in_bulk_then_restored_goes_to_the_queue(): void
    {
        $property = $this->draft(PropertyStatus::PendingReview, ['submitted_at' => now()]);

        $this->actingAsApi($this->agent);
        $this->postJson('/api/properties/bulk-archive', ['property_ids' => [$property->id]])
            ->assertOk()->assertJsonPath('archived', 1);
        $this->putJson("/api/properties/{$property->id}/status", ['status' => 'available'])->assertOk();

        $this->assertQueuedNotPublic($property);
    }

    /**
     * Raccord TCK-591 — `PropertyPublication` écrit par l'observateur : dépublier EN LOT annule
     * l'approbation comme l'unitaire, et republier repasse par la file.
     */
    public function test_unpublishing_in_bulk_cancels_the_approval_like_the_single_endpoint(): void
    {
        $property = $this->draft();
        $this->actingAsApi($this->agent);
        $this->postJson("/api/properties/{$property->id}/publish")->assertOk();
        $this->actingAsApi($this->admin);
        $this->postJson("/api/properties/{$property->id}/approve")->assertOk();

        $this->actingAsApi($this->agent);
        $this->postJson('/api/properties/bulk-visibility', ['property_ids' => [$property->id], 'visibility' => 'private'])
            ->assertOk()->assertJsonPath('updated', 1);
        $this->assertNull($property->refresh()->approved_at);
        $this->postJson("/api/properties/{$property->id}/publish")->assertOk();

        $this->assertQueuedNotPublic($property);
    }
}
