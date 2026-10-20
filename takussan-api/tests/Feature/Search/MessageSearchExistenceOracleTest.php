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
 * TCK-1071 (P62.05) — `GET /api/search/messages?filter[conversation]=` ne dit plus quelles
 * conversations existent. `exists:conversations,id` rendait 422 pour un fil absent, là où un fil
 * tiers passait la validation et rendait une page vide : les deux rendent désormais la page vide.
 */
class MessageSearchExistenceOracleTest extends TestCase
{
    use RefreshDatabase;

    private const ABSENT = 99999999;

    protected function setUp(): void
    {
        parent::setUp();
        config(['scout.driver' => 'collection']);
    }

    private function conversationOf(User $user, string $content): Conversation
    {
        $conversation = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Fil',
            'created_by' => $user->id,
        ]);
        $conversation->participants()->attach($user->id, [
            'role' => ParticipantRole::Member->value,
            'joined_at' => now(),
        ]);
        Message::factory()->create([
            'conversation_id' => $conversation->id,
            'sender_id' => $user->id,
            'content' => $content,
        ]);

        return $conversation;
    }

    public function test_un_fil_absent_rend_la_page_vide_d_un_fil_tiers(): void
    {
        $user = User::factory()->create();
        $this->conversationOf($user, 'loyer de septembre');
        $tiers = $this->conversationOf(User::factory()->create(), 'loyer d’octobre');

        $search = fn (int $conversationId) => $this->actingAs($user)
            ->getJson('/api/search/messages?q=loyer&filter[conversation]='.$conversationId);

        $deTiers = $search($tiers->id);
        $absent = $search(self::ABSENT);

        $deTiers->assertOk()->assertJsonCount(0, 'data');
        $this->assertSame([$deTiers->status(), $deTiers->json()], [$absent->status(), $absent->json()]);
    }

    public function test_le_filtre_garde_ses_propres_fils_et_refuse_un_non_entier(): void
    {
        $user = User::factory()->create();
        $mien = $this->conversationOf($user, 'loyer de septembre');

        $this->actingAs($user)
            ->getJson('/api/search/messages?q=loyer&filter[conversation]='.$mien->id)
            ->assertOk()->assertJsonCount(1, 'data');

        $this->actingAs($user)
            ->getJson('/api/search/messages?q=loyer&filter[conversation]=abc')
            ->assertStatus(422)->assertJsonValidationErrors('filter.conversation');
    }
}
