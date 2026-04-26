<?php

namespace Tests\Feature\Search;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-094 — Full-text search on messages.
 *
 * AC1: scoped to conversations the user participates in.
 * AC3: q < 2 chars → 422.
 * AC6: sort=relevance (default) + sort=-created_at.
 */
class MessageSearchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['scout.driver' => 'collection']);
    }

    private function makeConversationWithParticipant(User $user): Conversation
    {
        $conversation = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Test',
            'created_by' => $user->id,
        ]);

        $conversation->participants()->attach($user->id, [
            'role' => ParticipantRole::Member->value,
            'joined_at' => now(),
        ]);

        return $conversation;
    }

    public function test_search_returns_only_messages_in_user_conversations(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $myConvo = $this->makeConversationWithParticipant($user);
        $otherConvo = $this->makeConversationWithParticipant($other);

        // Message in user's conversation
        Message::factory()->create([
            'conversation_id' => $myConvo->id,
            'sender_id' => $user->id,
            'content' => 'loyer septembre paiement',
        ]);

        // Message in other user's conversation — should NOT appear
        Message::factory()->create([
            'conversation_id' => $otherConvo->id,
            'sender_id' => $other->id,
            'content' => 'loyer octobre paiement',
        ]);

        $response = $this->actingAs($user)
            ->getJson('/api/search/messages?q=loyer');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonFragment(['conversation_id' => $myConvo->id]);
    }

    public function test_short_query_returns_422(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/search/messages?q=a')
            ->assertUnprocessable();
    }

    public function test_missing_query_returns_422(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/search/messages')
            ->assertUnprocessable();
    }

    public function test_sort_by_created_at_descending(): void
    {
        $user = User::factory()->create();
        $convo = $this->makeConversationWithParticipant($user);

        $older = Message::factory()->create([
            'conversation_id' => $convo->id,
            'sender_id' => $user->id,
            'content' => 'facture mensuelle ancienne',
            'created_at' => now()->subDays(5),
        ]);

        $newer = Message::factory()->create([
            'conversation_id' => $convo->id,
            'sender_id' => $user->id,
            'content' => 'facture mensuelle récente',
            'created_at' => now(),
        ]);

        $response = $this->actingAs($user)
            ->getJson('/api/search/messages?q=facture&sort=-created_at');

        $response->assertOk();
        $data = $response->json('data');
        $this->assertCount(2, $data);
        $this->assertEquals($newer->id, $data[0]['id']);
        $this->assertEquals($older->id, $data[1]['id']);
    }

    public function test_pagination_defaults_to_20(): void
    {
        $user = User::factory()->create();
        $convo = $this->makeConversationWithParticipant($user);

        Message::factory()->count(25)->create([
            'conversation_id' => $convo->id,
            'sender_id' => $user->id,
            'content' => 'testpagination terme unique',
        ]);

        $response = $this->actingAs($user)
            ->getJson('/api/search/messages?q=testpagination');

        $response->assertOk();
        $this->assertCount(20, $response->json('data'));
        $this->assertEquals(25, $response->json('meta.total'));
    }

    public function test_per_page_max_is_50(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/search/messages?q=test&per_page=100')
            ->assertUnprocessable();
    }

    public function test_soft_deleted_messages_excluded(): void
    {
        $user = User::factory()->create();
        $convo = $this->makeConversationWithParticipant($user);

        $msg = Message::factory()->create([
            'conversation_id' => $convo->id,
            'sender_id' => $user->id,
            'content' => 'supprimé invisible terme',
        ]);

        $msg->delete(); // soft-delete

        $response = $this->actingAs($user)
            ->getJson('/api/search/messages?q=supprimé');

        $response->assertOk();
        $response->assertJsonCount(0, 'data');
    }

    public function test_unauthenticated_returns_401(): void
    {
        $this->getJson('/api/search/messages?q=test')
            ->assertUnauthorized();
    }

    public function test_filter_by_conversation(): void
    {
        $user = User::factory()->create();
        $convo1 = $this->makeConversationWithParticipant($user);
        $convo2 = $this->makeConversationWithParticipant($user);

        Message::factory()->create([
            'conversation_id' => $convo1->id,
            'sender_id' => $user->id,
            'content' => 'filtrage conversation un',
        ]);

        Message::factory()->create([
            'conversation_id' => $convo2->id,
            'sender_id' => $user->id,
            'content' => 'filtrage conversation deux',
        ]);

        $response = $this->actingAs($user)
            ->getJson("/api/search/messages?q=filtrage&filter[conversation]={$convo1->id}");

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonFragment(['conversation_id' => $convo1->id]);
    }
}
