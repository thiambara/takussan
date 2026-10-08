<?php

namespace Tests\Feature\Messaging;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-592 — AC22b : un participant n'usurpe pas un avis système.
 *
 * `type=system` posté par un participant était écrit tel quel, rendu comme un avis de la plateforme
 * et indélébile. Le témoin (`text`, ou rien) garde la route ouverte : une règle qui refuserait tout
 * rendrait les trois refus verts.
 */
class MessageTypeSpoofingTest extends TestCase
{
    use RefreshDatabase;

    public function test_participant_cannot_post_reserved_types(): void
    {
        [$member, $conversation] = $this->conversation();

        Sanctum::actingAs($member);

        foreach ([MessageType::System, MessageType::Image, MessageType::Document] as $type) {
            $this->postJson("/api/conversations/{$conversation->id}/messages", [
                'content' => 'Avis officiel de la plateforme',
                'type' => $type->value,
            ])->assertUnprocessable()->assertJsonValidationErrors('type');
        }

        $this->assertSame(0, Message::query()->where('conversation_id', $conversation->id)->count());
    }

    public function test_participant_posts_text(): void
    {
        [$member, $conversation] = $this->conversation();

        Sanctum::actingAs($member);

        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Bonjour'])
            ->assertCreated()
            ->assertJsonPath('data.type', 'text');
        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Re', 'type' => 'text'])
            ->assertCreated();

        $this->assertSame(2, Message::query()->where('conversation_id', $conversation->id)->count());
    }

    /** @return array{0: User, 1: Conversation} */
    private function conversation(): array
    {
        $admin = User::factory()->create();
        $member = User::factory()->create();

        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $admin->id,
        ]);
        $conversation->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $conversation->participants()->attach($member->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        return [$member, $conversation];
    }
}
