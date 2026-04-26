<?php

namespace Tests\Feature\Services;

use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use App\Services\Notifications\DigestBuilderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DigestBuilderServiceTest extends TestCase
{
    use RefreshDatabase;

    private DigestBuilderService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new DigestBuilderService;
    }

    public function test_groups_notifications_by_type(): void
    {
        $user = User::factory()->create();
        $window = now()->subDay();

        $this->makeNotification($user, ['type' => NotificationType::Booking->value]);
        $this->makeNotification($user, ['type' => NotificationType::Booking->value]);
        $this->makeNotification($user, ['type' => NotificationType::Payment->value]);

        $grouped = $this->service->buildForUser($user, $window);

        $this->assertArrayHasKey('booking', $grouped->toArray());
        $this->assertArrayHasKey('payment', $grouped->toArray());
        $this->assertCount(2, $grouped['booking']);
        $this->assertCount(1, $grouped['payment']);
    }

    public function test_excludes_critical_notifications(): void
    {
        $user = User::factory()->create();
        $window = now()->subDay();

        $this->makeNotification($user, ['data' => ['is_critical' => true]]);
        $this->makeNotification($user, []);

        $grouped = $this->service->buildForUser($user, $window);
        $all = $this->service->flatten($grouped);

        $this->assertCount(1, $all);
        $this->assertFalse((bool) ($all->first()->data['is_critical'] ?? false));
    }

    public function test_excludes_already_digested_notifications(): void
    {
        $user = User::factory()->create();
        $window = now()->subDay();

        $this->makeNotification($user, ['digested_at' => now()->subHour()]);
        $fresh = $this->makeNotification($user, []);

        $grouped = $this->service->buildForUser($user, $window);
        $all = $this->service->flatten($grouped);

        $this->assertCount(1, $all);
        $this->assertSame($fresh->id, $all->first()->id);
    }

    public function test_excludes_notifications_outside_window(): void
    {
        $user = User::factory()->create();
        $window = now()->subDay();

        $old = $this->makeNotification($user, []);
        $old->forceFill(['created_at' => now()->subDays(3), 'updated_at' => now()->subDays(3)])->save();

        $grouped = $this->service->buildForUser($user, $window);

        $this->assertTrue($this->service->flatten($grouped)->isEmpty());
    }

    public function test_excludes_read_notifications(): void
    {
        $user = User::factory()->create();
        $window = now()->subDay();

        $this->makeNotification($user, ['is_read' => true, 'read_at' => now()]);
        $unread = $this->makeNotification($user, []);

        $grouped = $this->service->buildForUser($user, $window);
        $all = $this->service->flatten($grouped);

        $this->assertCount(1, $all);
        $this->assertSame($unread->id, $all->first()->id);
    }

    public function test_limits_to_max_50_notifications(): void
    {
        $user = User::factory()->create();
        $window = now()->subDay();

        for ($i = 0; $i < 60; $i++) {
            $this->makeNotification($user, []);
        }

        $grouped = $this->service->buildForUser($user, $window);
        $all = $this->service->flatten($grouped);

        $this->assertCount(DigestBuilderService::MAX_NOTIFICATIONS, $all);
    }

    public function test_mark_digested_sets_digested_at(): void
    {
        $user = User::factory()->create();

        $n1 = $this->makeNotification($user, []);
        $n2 = $this->makeNotification($user, []);

        $this->service->markDigested(collect([$n1, $n2]));

        $this->assertNotNull($n1->fresh()->digested_at);
        $this->assertNotNull($n2->fresh()->digested_at);
    }

    public function test_mark_digested_is_noop_for_empty_collection(): void
    {
        $this->service->markDigested(collect());
        $this->assertTrue(true); // no exception
    }

    private function makeNotification(User $user, array $overrides = []): AppNotification
    {
        $n = AppNotification::create(array_merge([
            'user_id' => $user->id,
            'type' => NotificationType::System->value,
            'delivery_channel' => NotificationChannel::App->value,
            'title' => 'Test',
            'body' => 'Body',
            'is_read' => false,
        ], array_filter($overrides, fn ($k) => ! in_array($k, ['created_at', 'updated_at']), ARRAY_FILTER_USE_KEY)));

        if (isset($overrides['created_at'])) {
            $n->forceFill(['created_at' => $overrides['created_at'], 'updated_at' => $overrides['updated_at'] ?? $overrides['created_at']])->save();
        }

        return $n;
    }
}
