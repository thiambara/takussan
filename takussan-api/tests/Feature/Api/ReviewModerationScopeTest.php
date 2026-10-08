<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §1, AC1, AC2) — la modération des avis est cloisonnée à l'agence du profil
 * actif, et répondre est réservé au publieur, au personnel et au sujet.
 *
 * Avant : `isAgencyAdminAt($user->agency_id)` ouvrait `index`, `approve`, `reject`, `reports` et
 * `moderate` à l'admin de N'IMPORTE QUELLE agence, sur les avis de toutes les agences, et
 * `pending_count` comptait la plateforme. Répondre était ouvert à tout membre dont le profil actif
 * était dans l'agence du bien, bailleur compris.
 */
class ReviewModerationScopeTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agencyA;

    private Agency $agencyB;

    private User $adminA;

    private Property $propertyA;

    private Property $propertyB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agencyA = Agency::factory()->create();
        $this->agencyB = Agency::factory()->create();

        $this->adminA = User::factory()->create();
        $this->materializeRoleProfile($this->adminA, 'agency_admin', $this->agencyA);

        $this->propertyA = Property::factory()->create(['agency_id' => $this->agencyA->id]);
        $this->propertyB = Property::factory()->create(['agency_id' => $this->agencyB->id]);
    }

    private function reviewOn(Property|Agency $subject, ReviewStatus $status, array $attributes = []): Review
    {
        return Review::factory()->create(array_merge([
            'reviewable_type' => $subject::class,
            'reviewable_id' => $subject->id,
            'status' => $status,
            'is_approved' => $status === ReviewStatus::Approved || $status === ReviewStatus::Reported,
        ], $attributes));
    }

    // ─── AC1 : refus inter-agences, état inchangé ───────────────────────────────────────

    public function test_admin_of_a_cannot_act_on_a_review_of_b_and_the_review_is_unchanged(): void
    {
        $reviewB = $this->reviewOn($this->propertyB, ReviewStatus::Pending, ['is_approved' => false]);
        $this->assertSame($this->agencyB->id, $reviewB->agency_id, 'agency_id dérivé du bien à la création');

        $this->actingAsApi($this->adminA);

        $this->patchJson("/api/reviews/{$reviewB->id}/moderate", ['decision' => 'hide', 'reason_code' => 'spam'])
            ->assertForbidden();
        $this->patchJson("/api/reviews/{$reviewB->id}/moderate", ['decision' => 'approve'])
            ->assertForbidden();
        $this->postJson("/api/reviews/{$reviewB->id}/approve")->assertForbidden();
        $this->postJson("/api/reviews/{$reviewB->id}/reject")->assertForbidden();
        $this->getJson("/api/reviews/{$reviewB->id}/reports")->assertForbidden();

        $reviewB->refresh();
        $this->assertSame(ReviewStatus::Pending, $reviewB->status);
        $this->assertFalse($reviewB->is_approved);
        $this->assertNull($reviewB->deleted_at);
    }

    /** Autorisation AVANT validation : un corps invalide ne renseigne pas un admin d'une autre agence. */
    public function test_cross_agency_moderate_with_an_invalid_body_is_403_not_422(): void
    {
        $reviewB = $this->reviewOn($this->propertyB, ReviewStatus::Pending);
        $this->actingAsApi($this->adminA);

        $this->patchJson("/api/reviews/{$reviewB->id}/moderate", ['decision' => 'n-importe-quoi'])
            ->assertForbidden();
    }

    public function test_queue_lists_only_agency_a_and_pending_count_counts_only_a(): void
    {
        $pendingA1 = $this->reviewOn($this->propertyA, ReviewStatus::Pending);
        $pendingA2 = $this->reviewOn($this->propertyA, ReviewStatus::Pending);
        $reportedA = $this->reviewOn($this->propertyA, ReviewStatus::Reported);
        $approvedA = $this->reviewOn($this->propertyA, ReviewStatus::Approved);
        // Un avis SUR l'agence A : listé (l'admin le voit), mais il ne le tranche pas (plateforme).
        $onAgencyA = $this->reviewOn($this->agencyA, ReviewStatus::Pending);
        $this->reviewOn($this->propertyB, ReviewStatus::Pending);
        $this->reviewOn($this->propertyB, ReviewStatus::Reported);
        $this->reviewOn($this->agencyB, ReviewStatus::Pending);

        $this->actingAsApi($this->adminA);

        $response = $this->getJson('/api/reviews')->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->sort()->values()->all();
        $expected = collect([$pendingA1, $pendingA2, $reportedA, $approvedA, $onAgencyA])->pluck('id')->sort()->values()->all();
        $this->assertSame($expected, $ids);
        // Les 2 avis en attente sur les biens de A. Le signalé relève de la plateforme (verif-597 M3),
        // l'avis sur l'agence aussi.
        $this->assertSame(2, $response->json('meta.pending_count'));
    }

    public function test_pending_first_sort_puts_reviews_to_decide_on_top(): void
    {
        $approved = $this->reviewOn($this->propertyA, ReviewStatus::Approved, ['created_at' => now()]);
        $reported = $this->reviewOn($this->propertyA, ReviewStatus::Reported, ['created_at' => now()->subDay()]);
        $pending = $this->reviewOn($this->propertyA, ReviewStatus::Pending, ['created_at' => now()->subDays(2)]);

        $this->actingAsApi($this->adminA);

        $ids = collect($this->getJson('/api/reviews?sort=pending_first,-created_at')->assertOk()->json('data'))->pluck('id')->all();
        $this->assertSame([$pending->id, $reported->id, $approved->id], $ids);
    }

    public function test_per_page_is_capped_at_100(): void
    {
        $this->actingAsApi($this->adminA);

        $this->getJson('/api/reviews?per_page=1000')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 100);
    }

    public function test_admin_of_a_moderates_a_review_of_a(): void
    {
        $reviewA = $this->reviewOn($this->propertyA, ReviewStatus::Pending, ['is_approved' => false]);
        $other = $this->reviewOn($this->propertyA, ReviewStatus::Pending, ['is_approved' => false]);
        $reported = $this->reviewOn($this->propertyA, ReviewStatus::Reported, [
            'metadata' => ['reports' => [['user_id' => null, 'fingerprint' => 'abc', 'reason' => 'spam', 'reported_at' => now()->toISOString()]]],
        ]);
        $this->actingAsApi($this->adminA);

        $this->patchJson("/api/reviews/{$reviewA->id}/moderate", ['decision' => 'approve'])
            ->assertOk()
            ->assertJsonPath('data.status', ReviewStatus::Approved->value);
        $this->postJson("/api/reviews/{$other->id}/reject")
            ->assertOk()
            ->assertJsonPath('data.status', ReviewStatus::Rejected->value);
        $this->getJson("/api/reviews/{$reported->id}/reports")
            ->assertOk()
            ->assertJsonPath('data.0.anonymous', true)
            ->assertJsonMissingPath('data.0.fingerprint');
    }

    /**
     * verif-597 M3 — l'admin d'agence ne tranche que l'avis AVANT publication. Avant : il masquait
     * un 1★ publié sur son propre bien, sans signalement, et sa moyenne publique passait de 3 à 5.
     */
    public function test_an_agency_admin_cannot_take_down_a_published_review_and_the_average_holds(): void
    {
        $this->reviewOn($this->propertyA, ReviewStatus::Approved, ['rating' => 5]);
        $low = $this->reviewOn($this->propertyA, ReviewStatus::Approved, ['rating' => 1]);
        $reported = $this->reviewOn($this->propertyA, ReviewStatus::Reported, ['rating' => 1]);
        $pending = $this->reviewOn($this->propertyA, ReviewStatus::Pending, ['is_approved' => false]);
        $average = (float) $this->propertyA->refresh()->average_rating;

        $this->actingAsApi($this->adminA);
        foreach ([$low, $reported] as $published) {
            $this->patchJson("/api/reviews/{$published->id}/moderate", ['decision' => 'hide', 'reason_code' => 'off_topic'])
                ->assertForbidden();
            $this->patchJson("/api/reviews/{$published->id}/moderate", ['decision' => 'delete', 'reason_code' => 'spam'])
                ->assertForbidden();
            $this->postJson("/api/reviews/{$published->id}/reject")->assertForbidden();
        }
        // Même en attente, retirer ou ignorer reste à la plateforme : approuver ou masquer.
        $this->patchJson("/api/reviews/{$pending->id}/moderate", ['decision' => 'delete', 'reason_code' => 'spam'])
            ->assertForbidden();

        $this->assertSame(ReviewStatus::Approved, $low->refresh()->status);
        $this->assertSame(ReviewStatus::Reported, $reported->refresh()->status);
        $this->assertNull($pending->refresh()->deleted_at);
        $this->assertSame($average, (float) $this->propertyA->refresh()->average_rating);
        // L'agence garde la lecture des signalements de son périmètre.
        $this->getJson("/api/reviews/{$reported->id}/reports")->assertOk();
    }

    public function test_a_review_of_the_agency_itself_is_moderated_by_the_platform_only(): void
    {
        $onAgencyA = $this->reviewOn($this->agencyA, ReviewStatus::Pending, ['is_approved' => false]);
        $this->actingAsApi($this->adminA);

        $this->postJson("/api/reviews/{$onAgencyA->id}/approve")->assertForbidden();
        $this->assertSame(ReviewStatus::Pending, $onAgencyA->refresh()->status);

        $super = User::factory()->create();
        $this->materializeRoleProfile($super, 'super_admin');
        $this->actingAsApi($super);
        $this->postJson("/api/reviews/{$onAgencyA->id}/approve")->assertOk();
    }

    public function test_a_suspended_admin_loses_the_queue(): void
    {
        $reviewA = $this->reviewOn($this->propertyA, ReviewStatus::Pending);
        AgencyAdminProfile::query()->where('user_id', $this->adminA->id)
            ->update(['status' => AgencyAdminProfileStatus::Suspended->value]);

        $this->actingAsApi($this->adminA->fresh());

        $this->getJson('/api/reviews')->assertForbidden();
        $this->postJson("/api/reviews/{$reviewA->id}/approve")->assertForbidden();
    }

    public function test_an_individual_agency_admin_does_not_moderate(): void
    {
        $solo = Agency::factory()->individual()->create();
        $host = User::factory()->create();
        $this->materializeRoleProfile($host, 'agency_admin', $solo);
        $property = Property::factory()->create(['agency_id' => $solo->id]);
        $review = $this->reviewOn($property, ReviewStatus::Pending);

        $this->actingAsApi($host);

        $this->getJson('/api/reviews')->assertForbidden();
        $this->postJson("/api/reviews/{$review->id}/approve")->assertForbidden();
    }

    public function test_an_author_still_lists_their_own_reviews_with_their_own_pending_count(): void
    {
        $author = User::factory()->create();
        $this->reviewOn($this->propertyA, ReviewStatus::Pending, ['author_id' => $author->id]);
        $this->reviewOn($this->propertyB, ReviewStatus::Pending);

        $this->actingAsApi($author);

        $this->getJson('/api/reviews?filter[author_id]=me')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('meta.pending_count', 1);
    }

    // ─── AC2 : répondre ─────────────────────────────────────────────────────────────────

    public function test_a_landlord_member_cannot_reply_nor_delete_an_agent_reply(): void
    {
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $this->agencyA);
        $landlord = User::factory()->create(['agency_id' => $this->agencyA->id]); // OwnerProfile actif dans A

        $review = $this->reviewOn($this->propertyA, ReviewStatus::Approved, [
            'reply_content' => 'Réponse de l\'agent',
            'replied_by_id' => $agent->id,
            'replied_at' => now(),
        ]);

        $this->actingAsApi($landlord);

        $this->postJson("/api/reviews/{$review->id}/reply", ['reply_content' => 'Je réponds'])
            ->assertForbidden();
        $this->deleteJson("/api/reviews/{$review->id}/reply")->assertForbidden();

        $this->assertSame('Réponse de l\'agent', $review->refresh()->reply_content);
    }

    public function test_the_publisher_and_an_agent_of_a_reply(): void
    {
        $publisher = $this->propertyA->owner;
        $this->materializeRoleProfile($publisher, 'owner', $this->agencyA);
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $this->agencyA);
        $review = $this->reviewOn($this->propertyA, ReviewStatus::Approved);

        $this->actingAsApi($publisher);
        $this->postJson("/api/reviews/{$review->id}/reply", ['reply_content' => 'Merci'])->assertOk();

        $this->actingAsApi($agent);
        $this->postJson("/api/reviews/{$review->id}/reply", ['reply_content' => 'Merci, l\'agence'])
            ->assertOk()
            ->assertJsonPath('data.reply_content', 'Merci, l\'agence');
        $this->deleteJson("/api/reviews/{$review->id}/reply")->assertOk();
    }

    public function test_an_agent_of_b_cannot_reply_to_a_review_of_a(): void
    {
        $agentB = User::factory()->create();
        $this->materializeRoleProfile($agentB, 'agent', $this->agencyB);
        $review = $this->reviewOn($this->propertyA, ReviewStatus::Approved);

        $this->actingAsApi($agentB);
        $this->postJson("/api/reviews/{$review->id}/reply", ['reply_content' => 'x'])->assertForbidden();
    }

    public function test_a_blocked_landlord_publisher_loses_the_reply(): void
    {
        $publisher = $this->propertyA->owner;
        $this->materializeRoleProfile($publisher, 'owner', $this->agencyA);
        $publisher->ownerProfiles()->update(['status' => 'blocked']);
        $review = $this->reviewOn($this->propertyA, ReviewStatus::Approved);

        $this->actingAsApi($publisher->fresh());
        $this->postJson("/api/reviews/{$review->id}/reply", ['reply_content' => 'x'])->assertForbidden();
    }
}
