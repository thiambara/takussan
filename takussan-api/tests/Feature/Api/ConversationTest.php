<?php

namespace Tests\Feature\Api;

use App\Models\Property;
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

    public function test_conversation_list_includes_attached_property_for_subject_fallback(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $property = Property::factory()->create(['title' => 'Villa Almadies']);

        Sanctum::actingAs($me);
        $this->postJson('/api/conversations', [
            'subject' => null,
            'property_id' => $property->id,
            'participants' => [$other->id],
            'initial_message' => 'Bonjour',
        ])->assertCreated()
            ->assertJsonPath('data.subject', null)
            ->assertJsonPath('data.property.id', $property->id)
            ->assertJsonPath('data.property.title', 'Villa Almadies');

        $this->getJson('/api/conversations')
            ->assertOk()
            ->assertJsonPath('data.0.subject', null)
            ->assertJsonPath('data.0.property.id', $property->id)
            ->assertJsonPath('data.0.property.title', 'Villa Almadies');
    }

    public function test_conversation_list_omits_property_when_not_attached(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();

        Sanctum::actingAs($me);
        $this->postJson('/api/conversations', [
            'subject' => 'Sans propriété',
            'participants' => [$other->id],
            'initial_message' => 'Bonjour',
        ])->assertCreated();

        $this->getJson('/api/conversations')
            ->assertOk()
            // BelongsTo with null FK + whenLoaded → property serialized as null.
            ->assertJsonPath('data.0.property', null);
    }
}
