<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Enums\ReviewStatus;
use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-597 (ADR-0054 §6) — le drapeau `suspicious` d'un avis de la file : rafale, compte récent,
 * empreinte partagée. Il trie la file ; il ne décide rien.
 */
class SuspiciousReviewFlagTest extends ApiTestCase
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

    private function veteran(): User
    {
        return User::factory()->create(['created_at' => now()->subMonths(6)]);
    }

    private function review(Property $property, User $author, ?string $ipHash = null, ?\DateTimeInterface $at = null): Review
    {
        return Review::factory()->create([
            'reviewable_type' => Property::class,
            'reviewable_id' => $property->id,
            'author_id' => $author->id,
            'status' => ReviewStatus::Pending,
            'is_approved' => false,
            'metadata' => $ipHash ? ['ip_hash' => $ipHash] : null,
            'created_at' => $at ?? now(),
            'updated_at' => $at ?? now(),
        ]);
    }

    /** @return array<int, bool> */
    private function flags(): array
    {
        $this->actingAsApi($this->super);

        return collect($this->getJson('/api/admin/moderation?filter[type]=review&per_page=100')->assertOk()->json('data'))
            ->mapWithKeys(fn (array $item) => [$item['subject_id'] => $item['suspicious']])
            ->all();
    }

    public function test_each_signal_raises_the_flag_and_a_plain_review_does_not(): void
    {
        $plain = $this->review(Property::factory()->create(), $this->veteran(), str_repeat('a', 64), now()->subDays(3));

        $burstTarget = Property::factory()->create();
        $burst = collect(range(1, 3))->map(fn (int $h) => $this->review($burstTarget, $this->veteran(), null, now()->subHours($h)));

        $newcomer = $this->review(Property::factory()->create(), User::factory()->create(['created_at' => now()->subDays(2)]));

        $sharedTarget = Property::factory()->create();
        $sharedA = $this->review($sharedTarget, $this->veteran(), str_repeat('f', 64), now()->subDays(5));
        $sharedB = $this->review($sharedTarget, $this->veteran(), str_repeat('f', 64), now()->subDays(2));

        $flags = $this->flags();

        $this->assertFalse($flags[$plain->id]);
        foreach ($burst as $review) {
            $this->assertTrue($flags[$review->id], 'rafale');
        }
        $this->assertTrue($flags[$newcomer->id], 'compte récent');
        $this->assertTrue($flags[$sharedA->id], 'empreinte partagée');
        $this->assertTrue($flags[$sharedB->id], 'empreinte partagée');
    }

    public function test_suspicious_items_sort_first_and_nothing_is_decided_automatically(): void
    {
        // Le suspect est créé AVANT et daté plus tôt : ni l'identifiant ni la date ne le font
        // passer devant, seul le drapeau.
        $newcomer = $this->review(Property::factory()->create(), User::factory()->create(), null, now()->subDays(3));
        $plain = $this->review(Property::factory()->create(), $this->veteran(), null, now()->subMinute());

        $this->actingAsApi($this->super);
        $ids = collect($this->getJson('/api/admin/moderation?filter[type]=review')->assertOk()->json('data'))->pluck('subject_id')->all();

        $this->assertSame([$newcomer->id, $plain->id], $ids, 'le suspect passe devant, même plus ancien');
        $this->assertSame(ReviewStatus::Pending, $newcomer->refresh()->status);
    }
}
