<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §2, §3, AC9) — noter un prestataire sur une intervention terminée.
 */
class ServiceProviderReviewTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $requester;

    private ServiceProviderProfile $provider;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->requester = User::factory()->create();
        $this->provider = ServiceProviderProfile::factory()->create(['user_id' => User::factory()->create()->id]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $this->provider->id,
            'agency_id' => $this->agency->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->toDateString(),
        ]);
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id]);
    }

    private function intervention(MaintenanceStatus $status, ?int $assignedTo = null): MaintenanceRequest
    {
        return MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'requester_id' => $this->requester->id,
            'assigned_to' => $assignedTo ?? $this->provider->user_id,
            'status' => $status,
        ]);
    }

    private function rate(User $author, MaintenanceRequest $intervention, int $rating = 5): TestResponse
    {
        $this->actingAsApi($author);

        return $this->postJson("/api/service-providers/{$this->provider->id}/reviews", [
            'maintenance_request_id' => $intervention->id,
            'rating' => $rating,
            'content' => 'Intervention propre.',
        ]);
    }

    public function test_the_requester_of_a_completed_intervention_rates_the_assigned_provider_once(): void
    {
        $done = $this->intervention(MaintenanceStatus::Completed);

        $this->rate($this->requester, $done)->assertCreated();

        $review = Review::query()->latest('id')->firstOrFail();
        $this->assertSame(ServiceProviderProfile::class, $review->reviewable_type);
        $this->assertSame(MaintenanceRequest::class, $review->context_type);
        $this->assertSame($done->id, $review->context_id);
        $this->assertFalse($review->isAgencyModerated(), 'un avis de prestataire relève de la plateforme');

        $this->rate($this->requester, $done)->assertStatus(422)->assertJsonPath('code', 'review.intervention_already_reviewed');

        // Une AUTRE intervention terminée ouvre une autre note.
        $this->rate($this->requester, $this->intervention(MaintenanceStatus::Closed))->assertCreated();
        $this->assertSame(2, Review::query()->count());
    }

    public function test_an_open_intervention_or_one_assigned_to_someone_else_is_403(): void
    {
        $this->rate($this->requester, $this->intervention(MaintenanceStatus::Open))->assertForbidden();
        $this->rate($this->requester, $this->intervention(MaintenanceStatus::Completed, User::factory()->create()->id))->assertForbidden();

        $stranger = User::factory()->create();
        $this->rate($stranger, $this->intervention(MaintenanceStatus::Completed))->assertForbidden();

        $this->actingAsApi($this->requester);
        $this->postJson("/api/service-providers/{$this->provider->id}/reviews", ['rating' => 5])->assertForbidden();

        $this->assertSame(0, Review::query()->count());
    }

    public function test_agency_staff_may_rate_and_the_directory_average_counts_only_approved_reviews(): void
    {
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $this->agency);

        foreach ([[5, true], [3, true], [1, false]] as [$rating, $approved]) {
            Review::factory()->create([
                'reviewable_type' => ServiceProviderProfile::class,
                'reviewable_id' => $this->provider->id,
                'rating' => $rating,
                'status' => $approved ? ReviewStatus::Approved : ReviewStatus::Pending,
                'is_approved' => $approved,
            ]);
        }

        $this->rate($admin, $this->intervention(MaintenanceStatus::Completed), 1)->assertCreated();

        $this->actingAsApi($admin);
        $row = collect($this->getJson("/api/agencies/{$this->agency->id}/service-providers")->assertOk()->json('data'))
            ->firstWhere('id', $this->provider->id);

        $this->assertEquals(4.0, round((float) $row['average_rating'], 2));
        $this->assertSame(2, (int) $row['reviews_count']);
    }
}
