<?php

namespace Tests\Feature\Public;

use App\Models\Conversation;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyContactMessageTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_returns_401(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/contact-message", [
            'message' => 'Hello',
        ])->assertStatus(401);
    }

    public function test_creates_conversation_and_message_with_owner(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson("/api/public/properties/{$property->slug}/contact-message", [
            'message' => 'I am interested',
        ]);

        $response->assertCreated()->assertJsonStructure([
            'data' => ['conversation_id', 'redirect_to'],
        ]);

        $this->assertDatabaseHas('conversations', [
            'property_id' => $property->id,
            'created_by' => $user->id,
        ]);
        $this->assertDatabaseHas('messages', [
            'sender_id' => $user->id,
            'content' => 'I am interested',
        ]);
    }

    public function test_uses_primary_agent_when_collaborator_exists(): void
    {
        $owner = User::factory()->create();
        $agent = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $agent->id,
            'role' => CollaboratorRole::Agent->value,
            'accepted_at' => now(),
        ]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson("/api/public/properties/{$property->slug}/contact-message", [
            'message' => 'Hello agent',
        ])->assertCreated();

        $conversationId = $response->json('data.conversation_id');
        $this->assertDatabaseHas('conversation_participants', [
            'conversation_id' => $conversationId,
            'user_id' => $agent->id,
        ]);
        $this->assertDatabaseHas('conversation_participants', [
            'conversation_id' => $conversationId,
            'user_id' => $user->id,
        ]);
    }

    public function test_rejects_self_contact(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        Sanctum::actingAs($owner);

        $this->postJson("/api/public/properties/{$property->slug}/contact-message", [
            'message' => 'self',
        ])->assertStatus(422);
    }

    public function test_reuses_existing_conversation(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $r1 = $this->postJson("/api/public/properties/{$property->slug}/contact-message", ['message' => 'msg1'])
            ->assertCreated();
        $r2 = $this->postJson("/api/public/properties/{$property->slug}/contact-message", ['message' => 'msg2'])
            ->assertCreated();

        $this->assertSame($r1->json('data.conversation_id'), $r2->json('data.conversation_id'));
        $this->assertSame(1, Conversation::where('property_id', $property->id)->count());
    }

    public function test_unknown_slug_returns_404(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->postJson('/api/public/properties/unknown-slug/contact-message', [
            'message' => 'hello',
        ])->assertNotFound();
    }

    /**
     * P38.02 (TCK-813) — un groupe ouvert sur le bien, qui réunit le destinataire et le visiteur,
     * ne capte pas le message de contact : seule une directe le reçoit, et un fil neuf s'ouvre.
     */
    public function test_un_groupe_sur_le_bien_ne_capte_pas_le_contact(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        $user = User::factory()->create();
        $tiers = User::factory()->create();

        $group = $this->conversationOnProperty($property, ConversationType::Group, [
            $owner->id => ['joined_at' => now()],
            $user->id => ['joined_at' => now()],
            $tiers->id => ['joined_at' => now()],
        ]);
        Sanctum::actingAs($user);

        $id = $this->postJson("/api/public/properties/{$property->slug}/contact-message", ['message' => 'Prive'])
            ->assertCreated()
            ->json('data.conversation_id');

        $this->assertNotSame($group->id, $id);
        $this->assertSame(ConversationType::Direct, Conversation::findOrFail($id)->type);
        $this->assertDatabaseMissing('messages', ['conversation_id' => $group->id, 'content' => 'Prive']);
    }

    /** P38.02 (TCK-813) — une directe que le visiteur a quittée ne capte plus le contact. */
    public function test_une_directe_quittee_ne_capte_pas_le_contact(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        $user = User::factory()->create();

        $left = $this->conversationOnProperty($property, ConversationType::Direct, [
            $owner->id => ['joined_at' => now()],
            $user->id => ['joined_at' => now(), 'left_at' => now()],
        ]);
        Sanctum::actingAs($user);

        $id = $this->postJson("/api/public/properties/{$property->slug}/contact-message", ['message' => 'Relance'])
            ->assertCreated()
            ->json('data.conversation_id');

        $this->assertNotSame($left->id, $id);
        $this->getJson("/api/conversations/{$id}/messages")->assertOk();
    }

    /** @param  array<int, array<string, mixed>>  $participants */
    private function conversationOnProperty(Property $property, ConversationType $type, array $participants): Conversation
    {
        $conversation = Conversation::create([
            'type' => $type->value,
            'status' => ConversationStatus::Active->value,
            'created_by' => $property->user_id,
            'property_id' => $property->id,
        ]);
        $conversation->participants()->attach($participants);

        return $conversation;
    }
}
