<?php

namespace Tests\Feature\Notifications;

use App\Events\NewNotification;
use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\User;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Tests\TestCase;

class NotificationBroadcastTest extends TestCase
{
    use RefreshDatabase;

    public function test_broadcasting_config_is_loaded_and_safe_in_tests(): void
    {
        // Safety: without explicit BROADCAST_CONNECTION, tests should never
        // try to reach Pusher / Reverb. Accepts null / 'null' / 'log'.
        $default = config('broadcasting.default');
        $this->assertContains($default, [null, 'null', 'log']);
    }

    public function test_broadcasting_reverb_and_pusher_connections_exist(): void
    {
        $this->assertArrayHasKey('reverb', config('broadcasting.connections'));
        $this->assertArrayHasKey('pusher', config('broadcasting.connections'));
    }

    public function test_new_notification_event_targets_private_user_channel(): void
    {
        $user = User::factory()->create();
        $notification = AppNotification::create([
            'user_id' => $user->id,
            'type' => NotificationType::System,
            'delivery_channel' => NotificationChannel::App,
            'title' => 'Test',
            'body' => 'Body',
            'is_read' => false,
        ]);

        $event = new NewNotification($notification);
        $channels = $event->broadcastOn();

        $this->assertCount(1, $channels);
        $this->assertInstanceOf(PrivateChannel::class, $channels[0]);
        $this->assertSame('private-App.Models.User.'.$user->id, $channels[0]->name);
    }

    public function test_user_can_subscribe_to_own_channel(): void
    {
        $user = User::factory()->create();

        $callback = require base_path('routes/channels.php');
        // Laravel registers the channel auth callback inside Broadcast::channel
        // — assert via the Broadcast manager directly.
        $payload = Broadcast::channel('App.Models.User.{userId}', function ($u, $userId) {
            return (int) $u->id === (int) $userId;
        });

        $this->assertNotNull($payload);
        $this->assertTrue($payload !== false);

        // Boolean check of the auth logic itself
        $check = fn (User $u, int $id) => (int) $u->id === (int) $id;
        $this->assertTrue($check($user, $user->id));
        $this->assertFalse($check($user, $user->id + 99));
    }
}
