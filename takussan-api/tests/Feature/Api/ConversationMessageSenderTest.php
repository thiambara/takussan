<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2013 (P175.04) — chaque message du fil rend `sender: {id, full_name}`, que `ChatView` écrit
 * au-dessus d'un message reçu ; `sender` est nul pour un compte effacé.
 */
class ConversationMessageSenderTest extends TestCase
{
    use RefreshDatabase;

    private User $moi;

    private User $autre;

    private Conversation $fil;

    protected function setUp(): void
    {
        parent::setUp();

        $this->moi = User::factory()->create();
        $this->autre = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Diop']);
        $agence = Agency::factory()->create();
        $this->materializeRoleProfile($this->moi, 'agent', $agence);
        $this->materializeRoleProfile($this->autre, 'agent', $agence);

        Sanctum::actingAs($this->moi);
        $id = $this->postJson('/api/conversations', [
            'participants' => [$this->autre->id],
            'initial_message' => 'bonjour',
        ])->assertCreated()->json('data.id');
        $this->fil = Conversation::findOrFail($id);
    }

    private function messageDeAutre(): Message
    {
        return Message::factory()->create([
            'conversation_id' => $this->fil->id,
            'sender_id' => $this->autre->id,
            'content' => 'réponse',
        ]);
    }

    public function test_le_fil_rend_le_nom_de_l_auteur(): void
    {
        $message = $this->messageDeAutre();

        $data = $this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json('data');
        $ligne = collect($data)->firstWhere('id', $message->id);

        $this->assertSame(['id' => $this->autre->id, 'full_name' => 'Awa Diop'], $ligne['sender']);
    }

    public function test_la_relecture_par_after_id_rend_le_nom_de_l_auteur(): void
    {
        $premier = $this->fil->messages()->orderBy('id')->firstOrFail();
        $message = $this->messageDeAutre();

        $data = $this->getJson("/api/conversations/{$this->fil->id}/messages?after_id={$premier->id}")
            ->assertOk()->json('data');

        $this->assertSame([$message->id], array_column($data, 'id'));
        $this->assertSame(['id' => $this->autre->id, 'full_name' => 'Awa Diop'], $data[0]['sender']);
    }

    public function test_sender_est_nul_pour_un_compte_efface(): void
    {
        $message = $this->messageDeAutre();
        $this->autre->delete();

        $data = $this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json('data');
        $ligne = collect($data)->firstWhere('id', $message->id);

        $this->assertArrayHasKey('sender', $ligne);
        $this->assertNull($ligne['sender']);
        $this->assertSame($this->autre->id, $ligne['sender_id']);
    }
}
