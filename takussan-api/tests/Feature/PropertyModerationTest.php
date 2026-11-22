<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\User;
use App\Notifications\PropertyApprovedNotification;
use App\Notifications\PropertyRejectedNotification;
use App\Services\Property\PropertyModerationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

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
class PropertyModerationTest extends TestCase
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

        $response = $this->postJson("/api/properties/{$property->id}/approve");

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

        $this->postJson("/api/properties/{$property->id}/reject", [
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
        $response = $this->postJson("/api/properties/{$property->id}/reject", [
            'rejection_reason' => $reason,
            'reason_code' => 'photos',
        ]);

        $response->assertOk();
        $this->assertSame('rejected', $response->json('data.status'));

        $property->refresh();
        $this->assertSame(PropertyStatus::Rejected, $property->status);
        $this->assertSame($reason, $property->rejection_reason);
        $this->assertSame('photos', $property->rejection_reason_code);
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
            'rejection_reason_code' => 'photos',
            'rejected_at' => now()->subDay(),
        ]);

        $this->actingAs($agent);

        $response = $this->postJson("/api/properties/{$property->id}/resubmit");

        $response->assertOk();
        $this->assertSame('pending_review', $response->json('data.status'));

        $property->refresh();
        $this->assertSame(PropertyStatus::PendingReview, $property->status);
        $this->assertNull($property->rejection_reason);
        $this->assertNull($property->rejection_reason_code);
        $this->assertNotNull($property->submitted_at);
    }

    /** TCK-2672 (AC7) — « Demander une correction » exige un motif codé, en plus du texte. */
    public function test_reject_sans_code_de_motif_rend_422(): void
    {
        $agency = Agency::factory()->create(['moderation_required' => true]);
        $property = Property::factory()->create(['agency_id' => $agency->id, 'status' => PropertyStatus::PendingReview]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $reason = 'Les photos de ce bien ne respectent pas nos standards de qualité.';

        $this->postJson("/api/properties/{$property->id}/reject", ['rejection_reason' => $reason])
            ->assertUnprocessable()->assertJsonValidationErrors('reason_code');
        $this->postJson("/api/properties/{$property->id}/reject", ['rejection_reason' => $reason, 'reason_code' => 'couleur'])
            ->assertUnprocessable()->assertJsonValidationErrors('reason_code');

        $this->assertSame(PropertyStatus::PendingReview, $property->fresh()->status);
    }

    /** TCK-2672 (AC7) — l'auteur relit le code et la raison sur son bien. */
    public function test_l_auteur_relit_le_code_et_la_raison(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create(['moderation_required' => true]);
        $agent = $this->actingAsRole('agent', ['agency_id' => $agency->id]);
        $property = Property::factory()->create([
            'agency_id' => $agency->id, 'user_id' => $agent->id,
            'status' => PropertyStatus::PendingReview, 'submitted_at' => now(),
        ]);
        $reason = 'Le prix annoncé ne correspond pas au marché du quartier.';

        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $this->postJson("/api/properties/{$property->id}/reject", ['rejection_reason' => $reason, 'reason_code' => 'price'])->assertOk();

        $this->actingAs($agent);
        $this->getJson("/api/properties/{$property->id}")->assertOk()
            ->assertJsonPath('data.rejection_reason_code', 'price')
            ->assertJsonPath('data.rejection_reason', $reason);
    }

    /** TCK-2672 — approuver après une correction efface le code avec le texte. */
    public function test_approuver_efface_le_code(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create(['moderation_required' => true]);
        $property = Property::factory()->create([
            'agency_id' => $agency->id, 'status' => PropertyStatus::PendingReview, 'submitted_at' => now(),
            'rejection_reason' => 'Ancienne demande de correction, déjà traitée.', 'rejection_reason_code' => 'address',
        ]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $this->postJson("/api/properties/{$property->id}/approve")->assertOk();

        $this->assertNull($property->fresh()->rejection_reason_code);
    }

    /** TCK-2672 — un verrou plateforme (signalement tranché « masquer ») ne garde pas le code d'agence. */
    public function test_le_verrou_plateforme_efface_le_code(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create();
        $property = Property::factory()->create([
            'agency_id' => $agency->id, 'status' => PropertyStatus::Rejected,
            'rejection_reason' => 'Ancienne demande de correction.', 'rejection_reason_code' => 'price',
        ]);
        $report = PropertyReport::create(['property_id' => $property->id, 'reason' => 'fraud', 'details' => 'Annonce douteuse.']);
        $super = User::factory()->create();
        $this->materializeRoleProfile($super, 'super_admin');

        app(PropertyModerationService::class)->resolveReport($report, $super, 'hide', null, 'fraud');

        $property->refresh();
        $this->assertNotNull($property->platform_hold_at);
        $this->assertNull($property->rejection_reason_code);
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
    // Queue index — must include owner + agency so the admin UI can render
    // the agent name and agency name without a second round-trip.
    // ─────────────────────────────────────────────────────────────────────

    public function test_moderation_queue_includes_owner_and_agency(): void
    {
        $agency = Agency::factory()->create(['moderation_required' => true]);
        $agent = User::factory()->create(['agency_id' => $agency->id]);
        Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $agent->id,
            'status' => PropertyStatus::PendingReview,
            'submitted_at' => now(),
        ]);

        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $response = $this->getJson('/api/properties/moderation');

        $response->assertOk();
        $first = $response->json('data.0');
        $this->assertNotNull($first['owner'] ?? null, 'owner must be present in queue items');
        $this->assertSame($agent->id, $first['owner']['id']);
        $this->assertNotNull($first['agency'] ?? null, 'agency must be present in queue items');
        $this->assertSame($agency->id, $first['agency']['id']);
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

        $this->postJson("/api/properties/{$property->id}/approve")
            ->assertForbidden();
    }

    public function test_individual_agency_admin_cannot_list_moderation_queue(): void
    {
        $agency = Agency::factory()->individual()->create(['moderation_required' => true]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);

        $this->getJson('/api/properties/moderation')->assertForbidden();

        $agency->update(['kind' => AgencyKind::Standard]);
        $this->getJson('/api/properties/moderation')->assertOk();
    }
}
