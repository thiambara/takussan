<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Reprise du 2026-09-24 — `GET /api/conversations` ne rendait ni `unread_count` ni `participants`,
 * que le front lit tous deux : la pastille « messages non lus » (`useUnreadCount`) restait à 0,
 * quel que soit le nombre de messages reçus, et l'icône de sourdine n'apparaissait jamais.
 */
class ConversationUnreadCountTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: User, 2: int} */
    private function conversation(): array
    {
        Queue::fake();
        $moi = User::factory()->create();
        $autre = User::factory()->create();
        $agence = Agency::factory()->create();
        $this->materializeRoleProfile($moi, 'agent', $agence);
        $this->materializeRoleProfile($autre, 'agent', $agence);

        Sanctum::actingAs($moi);
        $id = $this->postJson('/api/conversations', [
            'subject' => 'Visite',
            'participants' => [$autre->id],
            'initial_message' => 'Bonjour',
        ])->assertCreated()->json('data.id');

        return [$moi, $autre, $id];
    }

    private function ecrire(User $auteur, int $conversationId, string $texte): void
    {
        Sanctum::actingAs($auteur);
        $this->postJson("/api/conversations/{$conversationId}/messages", ['content' => $texte])
            ->assertCreated();
    }

    private function nonLus(User $lecteur): int
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson('/api/conversations')->assertOk()->json('data.0.unread_count');
    }

    public function test_les_messages_d_un_autre_sont_non_lus_jusqu_a_la_lecture(): void
    {
        [$moi, $autre, $id] = $this->conversation();

        // Le destinataire n'a jamais lu : le premier message compte.
        $this->assertSame(1, $this->nonLus($autre));
        // Son propre message ne compte jamais pour l'auteur.
        $this->assertSame(0, $this->nonLus($moi));

        $this->travel(1)->minutes();
        $this->ecrire($moi, $id, 'Êtes-vous disponible demain ?');
        $this->assertSame(2, $this->nonLus($autre));

        Sanctum::actingAs($autre);
        $this->putJson("/api/conversations/{$id}/read")->assertOk();
        $this->assertSame(0, $this->nonLus($autre));

        // Un message arrivé APRÈS la lecture redevient non lu.
        $this->travel(1)->minutes();
        $this->ecrire($moi, $id, 'À 10 h ?');
        $this->assertSame(1, $this->nonLus($autre));

        // Répondre marque la conversation lue pour qui répond.
        $this->travel(1)->minutes();
        $this->ecrire($autre, $id, 'Oui.');
        $this->assertSame(0, $this->nonLus($autre));
        $this->assertSame(1, $this->nonLus($moi));
    }

    public function test_un_avis_systeme_et_un_message_supprime_ne_comptent_pas(): void
    {
        [$moi, $autre, $id] = $this->conversation();
        Sanctum::actingAs($autre);
        $this->putJson("/api/conversations/{$id}/read")->assertOk();

        $this->travel(1)->minutes();
        Message::query()->create([
            'conversation_id' => $id,
            'sender_id' => $moi->id,
            'content' => 'Membre ajouté',
            'type' => MessageType::System->value,
        ]);
        Message::query()->create([
            'conversation_id' => $id,
            'sender_id' => $moi->id,
            'content' => 'Retiré',
            'type' => MessageType::Text->value,
        ])->delete();

        $this->assertSame(0, $this->nonLus($autre));
    }

    public function test_la_liste_rend_les_participants_et_la_sourdine_du_seul_lecteur(): void
    {
        [$moi, $autre, $id] = $this->conversation();
        Sanctum::actingAs($autre);
        $this->putJson("/api/conversations/{$id}/mute", ['is_muted' => true])->assertOk();

        $participants = collect($this->getJson('/api/conversations')->assertOk()->json('data.0.participants'));
        $this->assertEqualsCanonicalizing([$moi->id, $autre->id], $participants->pluck('user_id')->all());
        $this->assertTrue($participants->firstWhere('user_id', $autre->id)['is_muted']);
        $this->assertArrayNotHasKey('is_muted', $participants->firstWhere('user_id', $moi->id));
    }
}
