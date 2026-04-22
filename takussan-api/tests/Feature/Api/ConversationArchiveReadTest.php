<?php

namespace Tests\Feature\Api;

use App\Jobs\NotifyNewMessageJob;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConversationArchiveReadTest extends TestCase
{
    use RefreshDatabase;

    private function createPair(): array
    {
        $me = User::factory()->create();
        $other = User::factory()->create();

        Sanctum::actingAs($me);
        $conversationId = $this->postJson('/api/conversations', [
            'subject' => 'test',
            'participants' => [$other->id],
            'initial_message' => 'Hello',
        ])->assertCreated()->json('data.id');

        return [$me, $other, $conversationId];
    }

    public function test_archive_hides_conversation_from_index(): void
    {
        [$me, $other, $conversationId] = $this->createPair();

        Sanctum::actingAs($me);
        $this->putJson("/api/conversations/{$conversationId}/archive")
            ->assertOk()
            ->assertJsonPath('data.conversation_id', $conversationId);

        $this->getJson('/api/conversations')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);

        // Archived filter surfaces it back
        $this->getJson('/api/conversations?archived=1')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_archive_does_not_affect_other_participant(): void
    {
        [$me, $other, $conversationId] = $this->createPair();

        Sanctum::actingAs($me);
        $this->putJson("/api/conversations/{$conversationId}/archive")->assertOk();

        Sanctum::actingAs($other);
        $this->getJson('/api/conversations')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_unarchive_restores_conversation(): void
    {
        [$me, $other, $conversationId] = $this->createPair();

        Sanctum::actingAs($me);
        $this->putJson("/api/conversations/{$conversationId}/archive")->assertOk();
        $this->putJson("/api/conversations/{$conversationId}/unarchive")
            ->assertOk()
            ->assertJsonPath('data.archived_at', null);

        $this->getJson('/api/conversations')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_new_message_unarchives_for_recipient(): void
    {
        [$me, $other, $conversationId] = $this->createPair();

        Sanctum::actingAs($other);
        $this->putJson("/api/conversations/{$conversationId}/archive")->assertOk();
        $this->getJson('/api/conversations')->assertJsonPath('meta.total', 0);

        // Sender pushes a new message; recipient's archive should clear.
        Sanctum::actingAs($me);
        $this->postJson("/api/conversations/{$conversationId}/messages", [
            'content' => 'Ping!',
        ])->assertCreated();

        Sanctum::actingAs($other);
        $this->getJson('/api/conversations')->assertJsonPath('meta.total', 1);
    }

    public function test_mark_as_read_updates_last_read_at(): void
    {
        [$me, $other, $conversationId] = $this->createPair();

        Sanctum::actingAs($other);
        $before = DB::table('conversation_participants')
            ->where('conversation_id', $conversationId)
            ->where('user_id', $other->id)
            ->value('last_read_at');

        $this->putJson("/api/conversations/{$conversationId}/read")->assertOk();

        $after = DB::table('conversation_participants')
            ->where('conversation_id', $conversationId)
            ->where('user_id', $other->id)
            ->value('last_read_at');

        $this->assertNotNull($after);
        $this->assertNotSame($before, $after);
    }

    public function test_non_participant_cannot_archive(): void
    {
        [$me, $other, $conversationId] = $this->createPair();
        $outsider = User::factory()->create();

        Sanctum::actingAs($outsider);
        $this->putJson("/api/conversations/{$conversationId}/archive")->assertForbidden();
        $this->putJson("/api/conversations/{$conversationId}/read")->assertForbidden();
    }

    public function test_send_message_dispatches_notification_job(): void
    {
        Queue::fake();
        [$me, $other, $conversationId] = $this->createPair();

        // createPair already sent an initial message — flush assertion state
        // by creating our own conversation fresh then send a message.
        Sanctum::actingAs($me);
        $response = $this->postJson("/api/conversations/{$conversationId}/messages", [
            'content' => 'Ping',
        ])->assertCreated();

        $messageId = $response->json('data.id');
        Queue::assertPushed(NotifyNewMessageJob::class, function (NotifyNewMessageJob $job) use ($messageId) {
            return $job->messageId === (int) $messageId;
        });
    }
}
