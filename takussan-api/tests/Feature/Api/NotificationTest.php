<?php

namespace Tests\Feature\Api;

use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private function makeNotification(User $user, array $overrides = []): AppNotification
    {
        return AppNotification::create(array_merge([
            'user_id' => $user->id,
            'type' => NotificationType::System,
            'delivery_channel' => NotificationChannel::App,
            'title' => 'Test notification',
            'body' => 'Body content',
            'is_read' => false,
        ], $overrides));
    }

    public function test_user_can_list_own_notifications(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $this->makeNotification($user);
        $this->makeNotification($user);
        $this->makeNotification($other);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/notifications')->assertOk();
        $this->assertEquals(2, $response->json('meta.total'));
    }

    public function test_unread_count_is_included_in_meta(): void
    {
        $user = User::factory()->create();
        $this->makeNotification($user, ['is_read' => false]);
        $this->makeNotification($user, ['is_read' => true, 'read_at' => now()]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/notifications')->assertOk();
        $this->assertEquals(1, $response->json('meta.unread'));
    }

    public function test_user_can_mark_notification_as_read(): void
    {
        $user = User::factory()->create();
        $notification = $this->makeNotification($user);

        Sanctum::actingAs($user);

        $this->postJson("/api/notifications/{$notification->id}/read")
            ->assertOk();

        $this->assertTrue($notification->fresh()->is_read);
        $this->assertNotNull($notification->fresh()->read_at);
    }

    public function test_user_can_mark_notification_as_unread(): void
    {
        $user = User::factory()->create();
        $notification = $this->makeNotification($user, [
            'is_read' => true,
            'read_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/notifications/{$notification->id}/unread")
            ->assertOk();

        $this->assertFalse($notification->fresh()->is_read);
        $this->assertNull($notification->fresh()->read_at);
    }

    public function test_user_cannot_mark_another_users_notification_as_read(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $notification = $this->makeNotification($owner);

        Sanctum::actingAs($other);

        $this->postJson("/api/notifications/{$notification->id}/read")
            ->assertForbidden();
    }

    public function test_user_cannot_mark_another_users_notification_as_unread(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $notification = $this->makeNotification($owner, [
            'is_read' => true,
            'read_at' => now(),
        ]);

        Sanctum::actingAs($other);

        $this->postJson("/api/notifications/{$notification->id}/unread")
            ->assertForbidden();
    }

    public function test_user_can_mark_all_as_read(): void
    {
        $user = User::factory()->create();
        $this->makeNotification($user);
        $this->makeNotification($user);

        Sanctum::actingAs($user);

        $this->postJson('/api/notifications/read-all')->assertOk();

        $unread = AppNotification::where('user_id', $user->id)->whereNull('read_at')->count();
        $this->assertEquals(0, $unread);
    }

    public function test_endpoints_require_auth(): void
    {
        $this->getJson('/api/notifications')->assertUnauthorized();
        $this->postJson('/api/notifications/1/read')->assertUnauthorized();
        $this->postJson('/api/notifications/1/unread')->assertUnauthorized();
        $this->postJson('/api/notifications/read-all')->assertUnauthorized();
    }
}
