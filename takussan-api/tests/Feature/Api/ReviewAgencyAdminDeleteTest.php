<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\ReviewStatus;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * TCK-2930 (AC4, ADR-0043 amendé le 2026-11-15) — l'admin d'agence supprime un avis de bien ou
 * d'agent de son périmètre, publié compris, et en ignore les signalements ; motif codé ET texte
 * exigés pour supprimer, chaque geste journalisé. L'avis sur l'agence elle-même, sur un prestataire
 * ou d'une autre agence reste hors de sa main (403). Approuver et masquer un avis publié aussi.
 */
class ReviewAgencyAdminDeleteTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agencyA;

    private User $adminA;

    private Property $propertyA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agencyA = Agency::factory()->create();
        $this->adminA = User::factory()->create();
        $this->materializeRoleProfile($this->adminA, 'agency_admin', $this->agencyA);
        $this->propertyA = Property::factory()->create(['agency_id' => $this->agencyA->id]);
    }

    private function reviewOn(Property|Agency|User|ServiceProviderProfile $subject, ReviewStatus $status = ReviewStatus::Approved, array $attributes = []): Review
    {
        return Review::factory()->create(array_merge([
            'reviewable_type' => $subject::class,
            'reviewable_id' => $subject->id,
            'status' => $status,
            'is_approved' => in_array($status, [ReviewStatus::Approved, ReviewStatus::Reported], true),
        ], $attributes));
    }

    public function test_the_agency_admin_deletes_a_published_review_of_their_property_with_a_logged_reason(): void
    {
        $this->reviewOn($this->propertyA, ReviewStatus::Approved, ['rating' => 5]);
        $low = $this->reviewOn($this->propertyA, ReviewStatus::Approved, ['rating' => 1]);
        $this->actingAsApi($this->adminA);

        // Le code seul ne suffit pas à l'admin d'agence : quelques mots aussi.
        $this->patchJson("/api/reviews/{$low->id}/moderate", ['decision' => 'delete', 'reason_code' => 'personal_data'])
            ->assertStatus(422)->assertJsonValidationErrors(['reason']);
        $this->assertNull($low->refresh()->deleted_at);

        $this->patchJson("/api/reviews/{$low->id}/moderate", [
            'decision' => 'delete', 'reason_code' => 'personal_data', 'reason' => 'Numéro de téléphone du gardien.',
        ])->assertOk()->assertJsonPath('data.deleted', true);

        $this->assertSoftDeleted('reviews', ['id' => $low->id]);
        $this->assertSame(5.0, (float) $this->propertyA->refresh()->average_rating);

        $log = Activity::query()->where('event', 'review.removed')->where('subject_id', $low->id)->sole();
        $this->assertSame($this->adminA->id, (int) $log->causer_id);
        $this->assertSame('personal_data', $log->properties['reason_code']);
        $this->assertSame('Numéro de téléphone du gardien.', $log->properties['reason']);
        $this->assertSame(ReviewStatus::Approved->value, $log->properties['status_before']);
        $this->assertFalse($log->properties['by_platform']);
    }

    public function test_the_agency_admin_deletes_an_agent_review_of_their_agency_and_ignores_reports(): void
    {
        $onAgent = $this->reviewOn(User::factory()->create(), ReviewStatus::Reported, ['agency_id' => $this->agencyA->id]);
        $this->actingAsApi($this->adminA);

        $this->patchJson("/api/reviews/{$onAgent->id}/moderate", ['decision' => 'ignore', 'reason_code' => 'other', 'reason' => 'Signalement sans fondement.'])
            ->assertOk()->assertJsonPath('data.id', $onAgent->id);
        $metadata = $onAgent->refresh()->metadata;
        $this->assertSame($this->adminA->id, $metadata['ignored_reports_by_id']);
        $this->assertSame(1, Activity::query()->where('event', 'review.reports_ignored')->where('subject_id', $onAgent->id)->count());

        $this->patchJson("/api/reviews/{$onAgent->id}/moderate", ['decision' => 'delete', 'reason_code' => 'fraud', 'reason' => 'Faux avis.'])
            ->assertOk();
        $this->assertSoftDeleted('reviews', ['id' => $onAgent->id]);
    }

    public function test_the_queue_offers_delete_and_dismiss_but_not_hide_on_a_published_review(): void
    {
        $published = $this->reviewOn($this->propertyA, ReviewStatus::Reported);
        $onAgency = $this->reviewOn($this->agencyA, ReviewStatus::Reported);
        $this->actingAsApi($this->adminA);

        $rows = collect($this->getJson('/api/reviews')->assertOk()->json('data'))->keyBy('id');
        $this->assertTrue($rows[$published->id]['can_delete']);
        $this->assertTrue($rows[$published->id]['can_dismiss_reports']);
        $this->assertFalse($rows[$published->id]['can_moderate']);
        $this->assertFalse($rows[$onAgency->id]['can_delete']);
        $this->assertFalse($rows[$onAgency->id]['can_dismiss_reports']);

        // Masquer un avis publié reste à la plateforme.
        $this->patchJson("/api/reviews/{$published->id}/moderate", ['decision' => 'hide', 'reason_code' => 'off_topic'])
            ->assertForbidden();
        $this->assertSame(ReviewStatus::Reported, $published->refresh()->status);
    }

    public function test_reviews_on_the_agency_itself_a_provider_or_another_agency_stay_out_of_reach(): void
    {
        $agencyB = Agency::factory()->create();
        $provider = ServiceProviderProfile::factory()->create(['user_id' => User::factory()->create()->id]);
        $outOfReach = [
            $this->reviewOn($this->agencyA),
            $this->reviewOn($provider, ReviewStatus::Approved, ['agency_id' => $this->agencyA->id]),
            $this->reviewOn(Property::factory()->create(['agency_id' => $agencyB->id])),
        ];
        $this->actingAsApi($this->adminA);

        foreach ($outOfReach as $review) {
            $this->patchJson("/api/reviews/{$review->id}/moderate", ['decision' => 'delete', 'reason_code' => 'fraud', 'reason' => 'Faux avis.'])
                ->assertForbidden();
            $this->patchJson("/api/reviews/{$review->id}/moderate", ['decision' => 'ignore', 'reason_code' => 'fraud'])
                ->assertForbidden();
            $this->assertNull($review->refresh()->deleted_at);
            $this->assertArrayNotHasKey('ignored_reports_by_id', $review->metadata ?? []);
        }
        $this->assertSame(0, Activity::query()->whereIn('event', ['review.removed', 'review.reports_ignored'])->count());
    }

    public function test_the_platform_deletes_with_the_code_alone_and_is_logged_too(): void
    {
        $review = $this->reviewOn($this->agencyA);
        $super = User::factory()->withTwoFactor()->create();
        $this->materializeRoleProfile($super, 'super_admin');
        $this->actingAsApi($super);

        $this->patchJson("/api/reviews/{$review->id}/moderate", ['decision' => 'delete', 'reason_code' => 'spam'])->assertOk();

        $log = Activity::query()->where('event', 'review.removed')->where('subject_id', $review->id)->sole();
        $this->assertTrue($log->properties['by_platform']);
    }
}
