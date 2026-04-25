<?php

namespace Tests\Feature\Api;

use App\Jobs\NotifyNewMessageJob;
use App\Models\AppNotification;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-085 — Covers AC6: a muted participant doesn't receive a
 * notification when a new message arrives, but the message is still
 * persisted and visible to them.
 */
class GroupMuteTest extends TestCase
{
    use RefreshDatabase;

    private function makeGroup(): array
    {
        $admin = User::factory()->create();
        $b = User::factory()->create();
        $c = User::factory()->create();

        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Mute test',
            'created_by' => $admin->id,
        ]);

        $conversation->participants()->attach($admin->id, [
            'role' => ParticipantRole::Admin->value, 'joined_at' => now(),
        ]);
        $conversation->participants()->attach($b->id, [
            'role' => ParticipantRole::Member->value, 'joined_at' => now(),
        ]);
        $conversation->participants()->attach($c->id, [
            'role' => ParticipantRole::Member->value, 'joined_at' => now(),
        ]);

        return [$admin, $b, $c, $conversation];
    }

    public function test_toggle_mute_endpoint_persists_is_muted(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        Sanctum::actingAs($b);
        $this->putJson("/api/conversations/{$conversation->id}/mute", [
            'is_muted' => true,
        ])->assertOk()->assertJsonPath('data.is_muted', true);

        $this->assertSame(1, (int) DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $b->id)
            ->value('is_muted'));
    }

    public function test_ac6_muted_participant_receives_no_notification(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        // Mute $b for this conversation.
        DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $b->id)
            ->update(['is_muted' => true]);

        // Fake the queue so the auto-dispatched job in sendMessage
        // doesn't double-fire alongside the explicit one we run below.
        Queue::fake();

        // $admin sends a message.
        Sanctum::actingAs($admin);
        $resp = $this->postJson("/api/conversations/{$conversation->id}/messages", [
            'content' => 'Hello group',
        ])->assertCreated();

        $messageId = $resp->json('data.id');

        // Run the dispatched notification job synchronously.
        (new NotifyNewMessageJob($messageId))->handle(app(NotificationService::class));

        // $c (not muted) gets one notification, $b (muted) gets none.
        $this->assertSame(1, AppNotification::query()->where('user_id', $c->id)->count());
        $this->assertSame(0, AppNotification::query()->where('user_id', $b->id)->count());

        // The message itself is still persisted and accessible.
        $this->assertDatabaseHas('messages', [
            'id' => $messageId,
            'conversation_id' => $conversation->id,
            'content' => 'Hello group',
        ]);

        // Even when listing as $b, the message is in the thread.
        Sanctum::actingAs($b);
        $messages = $this->getJson("/api/conversations/{$conversation->id}/messages")
            ->assertOk()
            ->json('data');
        $this->assertCount(1, $messages);
    }

    public function test_left_participant_receives_no_notification(): void
    {
        [$admin, $b, $c, $conversation] = $this->makeGroup();

        // $b leaves the group.
        DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $b->id)
            ->update(['left_at' => now()]);

        Queue::fake();

        Sanctum::actingAs($admin);
        $resp = $this->postJson("/api/conversations/{$conversation->id}/messages", [
            'content' => 'Bye',
        ])->assertCreated();

        (new NotifyNewMessageJob($resp->json('data.id')))->handle(app(NotificationService::class));

        $this->assertSame(0, AppNotification::query()->where('user_id', $b->id)->count());
        $this->assertSame(1, AppNotification::query()->where('user_id', $c->id)->count());
    }
}
