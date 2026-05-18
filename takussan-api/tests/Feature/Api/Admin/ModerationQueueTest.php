<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

class ModerationQueueTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_list_unified_moderation_queue(): void
    {
        $agency = Agency::factory()->create();
        $owner = User::factory()->create();
        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $owner->id,
            'status' => PropertyStatus::PendingReview,
            'submitted_at' => now()->subHour(),
        ]);
        Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $property->id,
            'status' => ReviewStatus::Reported,
            'reported_count' => 1,
            'metadata' => ['reports' => [['reason' => 'Spam', 'reported_at' => now()->toISOString()]]],
        ]);

        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/admin/moderation?include=subject,reporter&fields[moderation]=id,type,status,subject_id,agency_id,reported_at')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'type', 'status', 'subject_type', 'subject_id', 'subject', 'reporter', 'agency', 'reason']],
                'meta' => ['total', 'current_page', 'last_page', 'per_page'],
            ]);

        $this->assertSame(2, $response->json('meta.total'));
        $this->assertContains('property', array_column($response->json('data'), 'type'));
        $this->assertContains('review', array_column($response->json('data'), 'type'));
    }

    public function test_agency_admin_is_forbidden(): void
    {
        $this->actingAsRole('agency_admin');

        $this->getJson('/api/admin/moderation')->assertForbidden();
    }

    public function test_type_filter_is_strictly_whitelisted(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/moderation?filter[type]=message')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('filter.type');
    }

    public function test_agency_filter_limits_items_to_agency(): void
    {
        $firstAgency = Agency::factory()->create();
        $secondAgency = Agency::factory()->create();
        Property::factory()->create([
            'agency_id' => $firstAgency->id,
            'status' => PropertyStatus::PendingReview,
        ]);
        Property::factory()->create([
            'agency_id' => $secondAgency->id,
            'status' => PropertyStatus::PendingReview,
        ]);

        $this->actingAsRole('super_admin');

        $response = $this->getJson("/api/admin/moderation?filter[agency_id]={$firstAgency->id}")
            ->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
        $this->assertSame($firstAgency->id, $response->json('data.0.agency.id'));
    }

    public function test_decision_on_property_routes_through_property_service_and_audits(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create();
        $owner = User::factory()->create();
        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $owner->id,
            'status' => PropertyStatus::PendingReview,
            'submitted_at' => now(),
        ]);

        $this->actingAsRole('super_admin');

        $this->postJson("/api/admin/moderation/property:{$property->id}/decide", [
            'decision' => 'approve',
            'reason' => 'Conforme aux règles de publication.',
        ])->assertOk()
            ->assertJsonPath('data.subject_id', $property->id);

        $this->assertSame(PropertyStatus::Available, $property->refresh()->status);
        $this->assertTrue(Activity::query()
            ->where('event', 'super_admin_moderation_decision')
            ->where('subject_id', $property->id)
            ->exists());
    }

    public function test_decision_on_review_routes_through_review_service_and_audits(): void
    {
        $review = Review::factory()->create([
            'status' => ReviewStatus::Reported,
            'is_approved' => false,
        ]);

        $this->actingAsRole('super_admin');

        $this->postJson("/api/admin/moderation/review:{$review->id}/decide", [
            'decision' => 'hide',
            'reason' => 'Contenu injurieux.',
        ])->assertOk()
            ->assertJsonPath('data.subject_id', $review->id);

        $this->assertSame(ReviewStatus::Rejected, $review->refresh()->status);
        $this->assertTrue(Activity::query()
            ->where('event', 'super_admin_moderation_decision')
            ->where('subject_id', $review->id)
            ->exists());
    }

    public function test_property_reports_are_listed_as_flagged_and_can_be_resolved(): void
    {
        $property = Property::factory()->create();
        $report = PropertyReport::create([
            'property_id' => $property->id,
            'reporter_user_id' => User::factory()->create()->id,
            'reason' => 'fraud',
            'details' => 'Annonce douteuse.',
        ]);

        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/moderation?filter[type]=property&filter[status]=flagged')
            ->assertOk()
            ->assertJsonPath('data.0.id', "property_report:{$report->id}");

        $this->postJson("/api/admin/moderation/property_report:{$report->id}/decide", [
            'decision' => 'approve',
            'reason' => 'Signalement traité.',
        ])->assertOk();

        $this->assertNotNull($report->refresh()->resolved_at);
    }
}
