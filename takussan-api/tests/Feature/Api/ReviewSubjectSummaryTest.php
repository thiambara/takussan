<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2930 (AC2, AC3) — `GET /api/reviews/{review}/subject-summary` : la moyenne et le nombre des
 * avis publiés du sujet, ses 3 derniers AUTRES avis publiés, et « locataire depuis » de l'auteur.
 */
class ReviewSubjectSummaryTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agencyA;

    private User $adminA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agencyA = Agency::factory()->create();
        $this->adminA = User::factory()->create();
        $this->materializeRoleProfile($this->adminA, 'agency_admin', $this->agencyA);
    }

    private function review(Property|User $subject, int $rating, ReviewStatus $status, int $daysAgo, array $attributes = []): Review
    {
        $published = in_array($status, [ReviewStatus::Approved, ReviewStatus::Reported], true);

        return Review::factory()->create(array_merge([
            'reviewable_type' => $subject::class,
            'reviewable_id' => $subject->id,
            'rating' => $rating,
            'status' => $status,
            'is_approved' => $published,
            'created_at' => now()->subDays($daysAgo),
        ], $attributes));
    }

    /**
     * Douze avis publiés de moyenne 4,2 (6 × 5★, 2 × 4★, 4 × 3★ = 50 / 12), dont l'avis jugé — le
     * plus récent — et un signalé ; à côté, un avis en attente, un masqué et un supprimé plus récents
     * que tous les autres, qui ne comptent ni ne s'affichent.
     *
     * @return array{0: Review, 1: list<int>, 2: list<int>}
     */
    private function twelvePublishedOn(Property|User $subject, array $attributes = []): array
    {
        $judged = $this->review($subject, 3, ReviewStatus::Reported, 0, $attributes);
        $ratings = [5, 4, 3, 5, 5, 5, 5, 5, 4, 3, 3];
        $published = [];
        foreach ($ratings as $i => $rating) {
            $published[] = $this->review($subject, $rating, ReviewStatus::Approved, 10 + $i, $attributes)->id;
        }
        $hidden = [
            $this->review($subject, 1, ReviewStatus::Pending, 1, $attributes)->id,
            $this->review($subject, 1, ReviewStatus::Rejected, 2, $attributes)->id,
        ];
        $deleted = $this->review($subject, 1, ReviewStatus::Approved, 3, $attributes);
        $deleted->delete();
        $hidden[] = $deleted->id;

        return [$judged, array_slice($published, 0, 3), $hidden];
    }

    public function test_a_property_review_reads_the_subject_average_count_and_three_other_published_reviews(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agencyA->id]);
        [$judged, $latestOthers, $hidden] = $this->twelvePublishedOn($property);

        $this->actingAsApi($this->adminA);
        $data = $this->getJson("/api/reviews/{$judged->id}/subject-summary")->assertOk()->json('data');

        $this->assertSame(4.2, $data['subject']['average_rating']);
        $this->assertSame(12, $data['subject']['reviews_count']);
        $ids = array_column($data['others'], 'id');
        $this->assertSame($latestOthers, $ids);
        $this->assertNotContains($judged->id, $ids);
        $this->assertSame([], array_intersect($hidden, $ids));
        $this->assertSame(['id', 'rating', 'excerpt', 'author_name', 'created_at'], array_keys($data['others'][0]));
    }

    public function test_an_agent_review_reads_the_same_summary(): void
    {
        $agent = User::factory()->create();
        [$judged, $latestOthers] = $this->twelvePublishedOn($agent, ['agency_id' => $this->agencyA->id]);

        $this->actingAsApi($this->adminA);
        $this->getJson("/api/reviews/{$judged->id}/subject-summary")->assertOk()
            ->assertJsonPath('data.subject.average_rating', 4.2)
            ->assertJsonPath('data.subject.reviews_count', 12)
            ->assertJsonPath('data.others.*.id', $latestOthers);
    }

    public function test_tenant_since_is_the_start_of_the_authors_first_honoured_lease_in_the_agency(): void
    {
        $property = Property::factory()->create(['agency_id' => $this->agencyA->id]);
        $author = User::factory()->create();
        $customer = Customer::factory()->create(['user_id' => $author->id, 'agency_id' => $this->agencyA->id]);
        $lease = fn (string $start, LeaseStatus $status, ?int $agencyId) => Lease::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agencyId])->id,
            'tenant_id' => $customer->id, 'agency_id' => $agencyId, 'status' => $status, 'start_date' => $start,
        ]);
        $lease('2025-03-01', LeaseStatus::Terminated, $this->agencyA->id);
        $lease('2025-09-01', LeaseStatus::Active, $this->agencyA->id);
        // Ni un brouillon plus ancien, ni un bail d'une autre agence ne comptent.
        $lease('2024-01-01', LeaseStatus::Draft, $this->agencyA->id);
        $lease('2023-01-01', LeaseStatus::Active, Agency::factory()->create()->id);

        $withLease = $this->review($property, 4, ReviewStatus::Pending, 0, ['author_id' => $author->id]);
        $withoutLease = $this->review($property, 4, ReviewStatus::Pending, 0);

        $this->actingAsApi($this->adminA);
        $this->getJson("/api/reviews/{$withLease->id}/subject-summary")->assertOk()
            ->assertJsonPath('data.author.tenant_since', '2025-03-01');
        $this->getJson("/api/reviews/{$withoutLease->id}/subject-summary")->assertOk()
            ->assertJsonPath('data.author.tenant_since', null);
    }

    public function test_the_summary_is_bounded_to_the_moderators_scope(): void
    {
        $agencyB = Agency::factory()->create();
        $reviewB = $this->review(Property::factory()->create(['agency_id' => $agencyB->id]), 5, ReviewStatus::Approved, 0);
        $onAgencyA = $this->review(Property::factory()->create(['agency_id' => $this->agencyA->id]), 5, ReviewStatus::Approved, 0);

        $this->actingAsApi($this->adminA);
        $this->getJson("/api/reviews/{$reviewB->id}/subject-summary")->assertForbidden();
        $this->getJson("/api/reviews/{$onAgencyA->id}/subject-summary")->assertOk()
            ->assertJsonPath('data.subject.reviews_count', 1)
            ->assertJsonPath('data.others', []);

        $this->actingAsApi(User::factory()->create());
        $this->getJson("/api/reviews/{$onAgencyA->id}/subject-summary")->assertForbidden();
    }
}
