<?php

namespace Tests\Feature\Api;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConversationTest extends TestCase
{
    use RefreshDatabase;

    public function test_create_conversation_and_send_message(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();

        Sanctum::actingAs($me);

        $response = $this->postJson('/api/conversations', [
            'subject' => 'À propos de la villa',
            'participants' => [$other->id],
            'initial_message' => 'Bonjour, est-ce toujours disponible ?',
        ])->assertCreated();

        $conversationId = $response->json('data.id');

        $this->postJson("/api/conversations/{$conversationId}/messages", [
            'content' => 'Oui bien sûr, quand voulez-vous visiter ?',
        ])->assertCreated()
            ->assertJsonPath('data.content', 'Oui bien sûr, quand voulez-vous visiter ?');

        $this->getJson("/api/conversations/{$conversationId}/messages")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.has_more', false);
    }

    public function test_non_participant_cannot_send_message(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $outsider = User::factory()->create();

        Sanctum::actingAs($me);
        $conversationId = $this->postJson('/api/conversations', [
            'participants' => [$other->id],
        ])->json('data.id');

        Sanctum::actingAs($outsider);
        $this->postJson("/api/conversations/{$conversationId}/messages", ['content' => 'hi'])
            ->assertForbidden();
    }
}
