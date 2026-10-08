<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Enums\ReviewStatus;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0043 §7) — trancher plusieurs éléments d'un geste : une transaction par élément,
 * un résultat par élément.
 */
class ModerationBatchTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $super;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->super = User::factory()->create();
        $this->materializeRoleProfile($this->super, 'super_admin');
    }

    public function test_each_item_is_decided_on_its_own_and_reported_individually(): void
    {
        $spam = Review::factory()->count(2)->create(['status' => ReviewStatus::Reported, 'is_approved' => true]);
        $decided = Review::factory()->create(['status' => ReviewStatus::Rejected, 'is_approved' => false]);
        $claimed = Review::factory()->create(['status' => ReviewStatus::Pending, 'is_approved' => false]);

        $other = User::factory()->create();
        $this->materializeRoleProfile($other, 'super_admin');
        $this->actingAsApi($other);
        $this->postJson("/api/admin/moderation/review:{$claimed->id}/claim")->assertOk();

        $this->actingAsApi($this->super);
        $response = $this->postJson('/api/admin/moderation/decide-batch', [
            'ids' => ["review:{$spam[0]->id}", "review:{$spam[1]->id}", "review:{$decided->id}", "review:{$claimed->id}", 'review:999999', 'nimporte'],
            'decision' => 'hide',
            'reason_code' => 'spam',
        ])->assertOk();

        $results = collect($response->json('data'))->keyBy('id');
        $this->assertTrue($results["review:{$spam[0]->id}"]['ok']);
        $this->assertTrue($results["review:{$spam[1]->id}"]['ok']);
        $this->assertSame('moderation.already_decided', $results["review:{$decided->id}"]['code']);
        $this->assertSame(409, $results["review:{$claimed->id}"]['status']);
        $this->assertSame('moderation.claimed_by_other', $results["review:{$claimed->id}"]['code']);
        $this->assertSame(404, $results['review:999999']['status']);
        $this->assertSame('moderation.item_id_invalid', $results['nimporte']['code']);

        $this->assertSame(ReviewStatus::Rejected, $spam[0]->refresh()->status);
        $this->assertSame(ReviewStatus::Rejected, $spam[1]->refresh()->status);
        $this->assertSame(ReviewStatus::Pending, $claimed->refresh()->status);
    }

    public function test_the_batch_is_capped_at_50_and_needs_a_code(): void
    {
        $this->actingAsApi($this->super);

        $this->postJson('/api/admin/moderation/decide-batch', [
            'ids' => array_map(fn (int $i) => "review:{$i}", range(1, 51)),
            'decision' => 'hide',
            'reason_code' => 'spam',
        ])->assertStatus(422)->assertJsonValidationErrors('ids');

        $this->postJson('/api/admin/moderation/decide-batch', ['ids' => ['review:1'], 'decision' => 'hide'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason_code');
    }

    public function test_an_agency_admin_cannot_batch(): void
    {
        $this->actingAsRole('agency_admin');

        $this->postJson('/api/admin/moderation/decide-batch', ['ids' => ['review:1'], 'decision' => 'approve'])
            ->assertForbidden();
    }
}
