<?php

namespace Tests\Feature\Api;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\SystemMessageFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-671 (P06.02) — l'aperçu d'un avis système dans la liste des conversations se dérive côté
 * front de `metadata.event`. La liste doit donc rendre le TYPE et la `metadata` de son dernier
 * message : `last_message_preview` est écrit en français par `SystemMessageFactory::humanise()`,
 * quelle que soit la langue du lecteur.
 */
class ConversationListSystemPreviewTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: User, 2: Conversation} */
    private function groupe(): array
    {
        $admin = User::factory()->create(['first_name' => 'Alice', 'last_name' => 'Diop']);
        $membre = User::factory()->create(['first_name' => 'Bob', 'last_name' => 'Fall']);

        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Visites',
            'created_by' => $admin->id,
        ]);
        $conversation->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $conversation->participants()->attach($membre->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        return [$admin, $membre, $conversation];
    }

    public function test_la_liste_rend_l_evenement_du_dernier_avis_systeme(): void
    {
        [$admin, $membre, $conversation] = $this->groupe();
        app(SystemMessageFactory::class)->roleChanged($conversation, $admin, $membre, ParticipantRole::Admin->value);

        Sanctum::actingAs($membre);
        $dernier = $this->getJson('/api/conversations')->assertOk()->json('data.0.last_message');

        $this->assertSame('system', $dernier['type'] ?? null);
        $this->assertSame('role_changed', $dernier['metadata']['event'] ?? null);
        $this->assertSame('admin', $dernier['metadata']['role'] ?? null);
        $this->assertSame('Bob Fall', $dernier['metadata']['target_name'] ?? null);
    }

    public function test_un_message_ordinaire_ne_rend_que_son_type(): void
    {
        [$admin, $membre, $conversation] = $this->groupe();
        Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => $admin->id,
            'type' => 'text',
            'content' => 'Bonjour',
            'metadata' => ['duration' => 3],
        ]);

        Sanctum::actingAs($membre);
        $dernier = $this->getJson('/api/conversations')->assertOk()->json('data.0.last_message');

        $this->assertSame('text', $dernier['type'] ?? null);
        // La metadata d'un message d'un membre n'est pas l'objet de l'aperçu : elle ne sort pas.
        $this->assertNull($dernier['metadata']);
    }
}
