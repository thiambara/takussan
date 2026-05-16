<?php

namespace Tests\Feature\Api;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConversationMessagesPaginationTest extends TestCase
{
    use RefreshDatabase;

    private function makeConversationWithMessages(int $count): array
    {
        $me = User::factory()->create();
        $other = User::factory()->create();

        Sanctum::actingAs($me);

        $conversationId = $this->postJson('/api/conversations', [
            'participants' => [$other->id],
            'initial_message' => 'msg-0',
        ])->assertCreated()->json('data.id');

        $conversation = Conversation::findOrFail($conversationId);

        // The initial_message already created msg-0; add the remaining ones
        // straight via factory so the test stays fast.
        for ($i = 1; $i < $count; $i++) {
            Message::factory()->create([
                'conversation_id' => $conversation->id,
                'sender_id' => $me->id,
                'content' => "msg-{$i}",
            ]);
        }

        return [$me, $conversation];
    }

    public function test_initial_load_returns_latest_page_with_has_more(): void
    {
        [, $conversation] = $this->makeConversationWithMessages(50);

        $response = $this->getJson("/api/conversations/{$conversation->id}/messages?per_page=30")
            ->assertOk()
            ->assertJsonCount(30, 'data')
            ->assertJsonPath('meta.has_more', true);

        $contents = collect($response->json('data'))->pluck('content')->all();
        $this->assertSame('msg-49', $contents[0]);
        $this->assertSame('msg-20', $contents[29]);
    }

    public function test_before_id_returns_older_slice(): void
    {
        [, $conversation] = $this->makeConversationWithMessages(50);

        $first = $this->getJson("/api/conversations/{$conversation->id}/messages?per_page=30")
            ->json('data');
        $oldestLoadedId = $first[count($first) - 1]['id'];

        $response = $this->getJson(
            "/api/conversations/{$conversation->id}/messages?before_id={$oldestLoadedId}&per_page=30"
        )
            ->assertOk()
            ->assertJsonCount(20, 'data')
            ->assertJsonPath('meta.has_more', false);

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertLessThan($oldestLoadedId, $ids[0]);
    }

    public function test_after_id_returns_only_newer_messages_in_ascending_order(): void
    {
        [, $conversation] = $this->makeConversationWithMessages(10);

        $latest = $this->getJson("/api/conversations/{$conversation->id}/messages?per_page=30")
            ->json('data');
        $anchorId = $latest[2]['id'];

        $response = $this->getJson(
            "/api/conversations/{$conversation->id}/messages?after_id={$anchorId}"
        )
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.has_more', false);

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertGreaterThan($anchorId, $ids[0]);
        $this->assertGreaterThan($ids[0], $ids[1]);
    }

    public function test_before_id_and_after_id_are_mutually_exclusive(): void
    {
        [, $conversation] = $this->makeConversationWithMessages(5);

        $this->getJson("/api/conversations/{$conversation->id}/messages?before_id=1&after_id=2")
            ->assertStatus(422);
    }

    public function test_per_page_is_capped_at_100(): void
    {
        [, $conversation] = $this->makeConversationWithMessages(5);

        $this->getJson("/api/conversations/{$conversation->id}/messages?per_page=500")
            ->assertStatus(422);
    }
}
