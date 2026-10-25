<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\Review;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * P199.02 (TCK-2165) — les tuiles « Biens » et « Avis » de la file de modération comptaient les
 * lignes de la page de 20. L'API rend désormais les comptes par type de TOUTE la file filtrée, dans
 * `meta.counts`, sous le même filtre que la liste.
 */
class ModerationQueueCountsTest extends TestCase
{
    use RefreshDatabase;

    public function test_counts_cover_the_whole_filtered_queue_not_the_page(): void
    {
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();

        Property::factory()->count(3)->create([
            'agency_id' => $agency->id,
            'status' => PropertyStatus::PendingReview,
            'submitted_at' => now()->subHour(),
        ]);
        $reviewed = Property::factory()->create(['agency_id' => $agency->id]);
        Review::factory()->count(2)->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $reviewed->id,
            'status' => ReviewStatus::Pending,
        ]);
        Property::factory()->create([
            'agency_id' => $other->id,
            'status' => PropertyStatus::PendingReview,
        ]);

        $this->actingAsRole('super_admin');

        $page = $this->getJson('/api/admin/moderation?per_page=2')->assertOk();
        $this->assertCount(2, $page->json('data'));
        $this->assertSame(6, $page->json('meta.total'));
        $this->assertSame(['property' => 4, 'review' => 2], $page->json('meta.counts'));

        $agencyOnly = $this->getJson("/api/admin/moderation?per_page=2&filter[agency_id]={$agency->id}")->assertOk();
        $this->assertSame(['property' => 3, 'review' => 2], $agencyOnly->json('meta.counts'));

        $reviewsOnly = $this->getJson('/api/admin/moderation?per_page=2&filter[type]=review')->assertOk();
        $this->assertSame(['property' => 0, 'review' => 2], $reviewsOnly->json('meta.counts'));
    }

    public function test_counts_are_zero_on_an_empty_queue(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/moderation')
            ->assertOk()
            ->assertJsonPath('meta.counts', ['property' => 0, 'review' => 0]);
    }
}
