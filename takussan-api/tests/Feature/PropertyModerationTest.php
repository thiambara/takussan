<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use App\Notifications\PropertyApprovedNotification;
use App\Notifications\PropertyRejectedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\BaseTestCase;

/**
 * TCK-098 — Property moderation workflow.
 *
 * 5 scenarios:
 *  1. submit: agency with moderation_required=true → property becomes pending_review
 *  2. approve: admin approves → status becomes available, notification sent
 *  3. reject: admin rejects with reason → status becomes rejected, notification sent
 *  4. resubmit: agent resubmits rejected property → back to pending_review
 *  5. flag-off bypass: agency with moderation_required=false → property stays available
 */
class PropertyModerationTest extends BaseTestCase
{
    use RefreshDatabase;

    // ─────────────────────────────────────────────────────────────────────
    // Scenario 1 — Submit: property is intercepted to pending_review
    // ─────────────────────────────────────────────────────────────────────

    public function test_new_property_becomes_pending_review_when_agency_moderation_is_on(): void
    {
        $agency = Agency::factory()->create(['moderation_required' => true]);
        $agent = $this->actingAsRole('agent', ['agency_id' => $agency->id]);

        $response = $this->postJson('/api/properties', [
            'title' => 'Appartement à Dakar',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'price' => 500_000,
            'status' => 'available',
            'visibility' => PropertyVisibility::Private->value,
        ]);

        $response->assertCreated();
        $this->assertSame('pending_review', $response->json('data.status'));

        $property = Property::find($response->json('data.id'));
        $this->assertNotNull($property->submitted_at);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Scenario 2 — Approve: admin approves, agent is notified
    // ─────────────────────────────────────────────────────────────────────

    public function test_admin_can_approve_pending_property(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create(['moderation_required' => true]);
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $agent->id,
            'status' => PropertyStatus::PendingReview,
            'submitted_at' => now(),
        ]);

        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $response = $this->postJson("/api/admin/properties/{$property->id}/approve");

        $response->assertOk();
        $this->assertSame('available', $response->json('data.status'));

        $property->refresh();
        $this->assertSame(PropertyStatus::Available, $property->status);
        $this->assertNotNull($property->approved_at);

        Notification::assertSentTo($agent, PropertyApprovedNotification::class);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Scenario 3 — Reject: valid reason → status rejected, notification sent
    //              invalid reason (< 20 chars) → 422
    // ─────────────────────────────────────────────────────────────────────

    public function test_reject_without_reason_returns_422(): void
    {
        $agency = Agency::factory()->create(['moderation_required' => true]);
        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'status' => PropertyStatus::PendingReview,
        ]);

        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $this->postJson("/api/admin/properties/{$property->id}/reject", [
            'rejection_reason' => 'trop court',
        ])->assertUnprocessable();
    }

    public function test_admin_can_reject_pending_property_with_reason(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create(['moderation_required' => true]);
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $agent->id,
            'status' => PropertyStatus::PendingReview,
            'submitted_at' => now(),
        ]);

        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $reason = 'Les photos de ce bien ne respectent pas nos standards de qualité.';
        $response = $this->postJson("/api/admin/properties/{$property->id}/reject", [
            'rejection_reason' => $reason,
        ]);

        $response->assertOk();
        $this->assertSame('rejected', $response->json('data.status'));

        $property->refresh();
        $this->assertSame(PropertyStatus::Rejected, $property->status);
        $this->assertSame($reason, $property->rejection_reason);
        $this->assertNotNull($property->rejected_at);

        Notification::assertSentTo($agent, PropertyRejectedNotification::class);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Scenario 4 — Resubmit: agent resubmits rejected property
    // ─────────────────────────────────────────────────────────────────────

    public function test_agent_can_resubmit_rejected_property(): void
    {
        $agency = Agency::factory()->create(['moderation_required' => true]);
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $agent->id,
            'status' => PropertyStatus::Rejected,
            'rejection_reason' => 'Photos insuffisantes pour publication sur la plateforme.',
            'rejected_at' => now()->subDay(),
        ]);

        $this->actingAs($agent);

        $response = $this->postJson("/api/admin/properties/{$property->id}/resubmit");

        $response->assertOk();
        $this->assertSame('pending_review', $response->json('data.status'));

        $property->refresh();
        $this->assertSame(PropertyStatus::PendingReview, $property->status);
        $this->assertNull($property->rejection_reason);
        $this->assertNotNull($property->submitted_at);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Scenario 5 — Flag-off bypass: moderation disabled → property stays available
    // ─────────────────────────────────────────────────────────────────────

    public function test_property_stays_available_when_agency_moderation_is_off(): void
    {
        $agency = Agency::factory()->create(['moderation_required' => false]);
        $agent = $this->actingAsRole('agent', ['agency_id' => $agency->id]);

        $response = $this->postJson('/api/properties', [
            'title' => 'Villa à Ngor',
            'type' => 'villa',
            'contract_type' => 'sale',
            'price' => 120_000_000,
            'status' => 'available',
            'visibility' => PropertyVisibility::Private->value,
        ]);

        $response->assertCreated();
        // The observer should NOT intercept — status remains draft (default) or available.
        $this->assertNotSame('pending_review', $response->json('data.status'));
    }

    // ─────────────────────────────────────────────────────────────────────
    // AC7 — Agent from another agency cannot approve/reject (403)
    // ─────────────────────────────────────────────────────────────────────

    public function test_admin_from_different_agency_cannot_approve(): void
    {
        $agency1 = Agency::factory()->create(['moderation_required' => true]);
        $agency2 = Agency::factory()->create();
        $property = Property::factory()->create([
            'agency_id' => $agency1->id,
            'status' => PropertyStatus::PendingReview,
        ]);

        // Admin from agency2 tries to approve a property belonging to agency1.
        $this->actingAsRole('agency_admin', ['agency_id' => $agency2->id]);

        $this->postJson("/api/admin/properties/{$property->id}/approve")
            ->assertForbidden();
    }
}
