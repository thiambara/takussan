<?php

namespace Tests\Feature\Public;

use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-500 — l'endpoint de RÉSOLUTION, jumeau en lecture seule de `contact-message`.
 *
 * Il répond au front une seule question : « en cliquant sur "Envoyer un message",
 * est-ce que j'ouvre un fil qui existe, ou un fil qui n'existe pas encore ? »
 *
 * ⚠️ Sa propriété la plus importante n'est pas ce qu'il rend, c'est ce qu'il N'ÉCRIT PAS.
 * Le brouillon s'affiche à l'ouverture du chat ; si cet endpoint créait la conversation,
 * chaque curieux laisserait un fil vide dans la boîte d'un agent. D'où
 * `test_resolve_writes_nothing`, qui compte les lignes des trois tables autour de l'appel.
 */
class PropertyConversationResolveTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_returns_401(): void
    {
        $property = Property::factory()->published()->create();

        $this->getJson("/api/public/properties/{$property->slug}/conversation")
            ->assertStatus(401);
    }

    public function test_unknown_slug_returns_404(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/public/properties/unknown-slug/conversation')
            ->assertNotFound();
    }

    public function test_draft_property_returns_404(): void
    {
        $property = Property::factory()->published()->create([
            'status' => PropertyStatus::Draft->value,
        ]);
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/public/properties/{$property->slug}/conversation")
            ->assertNotFound();
    }

    public function test_returns_null_conversation_when_none_exists(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/public/properties/{$property->slug}/conversation")
            ->assertOk()
            ->assertJsonPath('data.conversation_id', null)
            ->assertJsonPath('data.can_message', true)
            ->assertJsonPath('data.property.reference_number', $property->reference_number)
            ->assertJsonPath('data.recipient.id', $owner->id);
    }

    /**
     * Le cœur du ticket : ouvrir le chat ne doit rien créer. Un correctif qui résoudrait par
     * `firstOrCreate` passerait tous les autres tests de ce fichier et échouerait ici seul.
     */
    public function test_resolve_writes_nothing(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        Sanctum::actingAs(User::factory()->create());

        $before = [
            'conversations' => \DB::table('conversations')->count(),
            'conversation_participants' => \DB::table('conversation_participants')->count(),
            'messages' => \DB::table('messages')->count(),
        ];

        $this->getJson("/api/public/properties/{$property->slug}/conversation")->assertOk();
        $this->getJson("/api/public/properties/{$property->slug}/conversation")->assertOk();

        foreach ($before as $table => $count) {
            $this->assertSame($count, \DB::table($table)->count(), "La table {$table} a été écrite.");
        }
    }

    public function test_returns_existing_conversation_id(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $created = $this->postJson("/api/public/properties/{$property->slug}/contact-message", [
            'message' => 'Bonjour',
        ])->assertCreated()->json('data.conversation_id');

        $this->getJson("/api/public/properties/{$property->slug}/conversation")
            ->assertOk()
            ->assertJsonPath('data.conversation_id', $created);
    }

    public function test_recipient_is_the_primary_agent_when_one_exists(): void
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
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/public/properties/{$property->slug}/conversation")
            ->assertOk()
            ->assertJsonPath('data.recipient.id', $agent->id);
    }

    public function test_cannot_message_own_property(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        Sanctum::actingAs($owner);

        $this->getJson("/api/public/properties/{$property->slug}/conversation")
            ->assertOk()
            ->assertJsonPath('data.can_message', false)
            ->assertJsonPath('data.conversation_id', null);
    }

    /**
     * AC6 — la résolution et la livraison doivent nommer le MÊME destinataire. Deux calculs
     * séparés ouvriraient un fil et déposeraient le message dans un autre ; c'est le motif
     * pour lequel les deux chemins partagent `PropertyConversationResolver`.
     */
    public function test_resolved_recipient_is_the_one_that_receives_the_message(): void
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

        $resolved = $this->getJson("/api/public/properties/{$property->slug}/conversation")
            ->assertOk()->json('data.recipient.id');

        $conversationId = $this->postJson("/api/public/properties/{$property->slug}/contact-message", [
            'message' => 'Bonjour',
        ])->assertCreated()->json('data.conversation_id');

        $this->assertDatabaseHas('conversation_participants', [
            'conversation_id' => $conversationId,
            'user_id' => $resolved,
        ]);
        $this->assertSame($agent->id, $resolved);
    }

    /** AC9 — `/messages/{id}` n'existe pas côté front ; la destination annoncée doit être réelle. */
    public function test_redirect_to_points_at_the_real_inbox_route(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        Sanctum::actingAs(User::factory()->create());

        $response = $this->postJson("/api/public/properties/{$property->slug}/contact-message", [
            'message' => 'Bonjour',
        ])->assertCreated();

        $this->assertSame(
            "/app/messages?conversation={$response->json('data.conversation_id')}",
            $response->json('data.redirect_to'),
        );
    }
}
