<?php

namespace Tests\Feature\Messaging;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2859 (ADR-0114 § 1) — `PUT /api/conversations/{c}/unread` : l'agent remet un fil lu en non lu
 * pour le traiter plus tard. Le `last_read_at` du lecteur passe juste avant le dernier message d'un
 * autre (hors avis système et message supprimé) : un non-lu, quel que soit le moment de l'appel.
 */
class ConversationUnreadTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: User, 2: int} */
    private function filLu(): array
    {
        Queue::fake();
        $agence = Agency::factory()->create();
        $moi = User::factory()->create();
        $autre = User::factory()->create();
        $this->materializeRoleProfile($moi, 'agent', $agence);
        $this->materializeRoleProfile($autre, 'agent', $agence);

        Sanctum::actingAs($autre);
        $id = $this->postJson('/api/conversations', [
            'participants' => [$moi->id],
            'initial_message' => 'Bonjour',
        ])->assertCreated()->json('data.id');

        $this->travel(1)->minutes();
        $this->postJson("/api/conversations/{$id}/messages", ['content' => 'Le bien est-il libre ?'])->assertCreated();

        $this->travel(1)->minutes();
        Sanctum::actingAs($moi);
        $this->putJson("/api/conversations/{$id}/read")->assertOk();

        return [$moi, $autre, $id];
    }

    /** @return array{0: int, 1: int} unread_count du fil, meta.counts.unread */
    private function comptes(User $lecteur): array
    {
        Sanctum::actingAs($lecteur);
        $r = $this->getJson('/api/conversations')->assertOk();

        return [(int) $r->json('data.0.unread_count'), (int) $r->json('meta.counts.unread')];
    }

    public function test_ac1_un_fil_lu_remis_en_non_lu_compte_un_non_lu(): void
    {
        [$moi, , $id] = $this->filLu();
        $this->assertSame([0, 0], $this->comptes($moi));

        $this->travel(5)->minutes();
        Sanctum::actingAs($moi);
        $this->putJson("/api/conversations/{$id}/unread")->assertOk()
            ->assertJsonPath('data.conversation_id', $id);

        $this->assertSame([1, 1], $this->comptes($moi));
    }

    /** ADR-0114 § 1, conséquence assumée : l'accusé de l'auteur (`read_by_recipient`, TCK-2858) suit. */
    public function test_l_accuse_de_lecture_de_l_auteur_repasse_a_non_lu(): void
    {
        [$moi, $autre, $id] = $this->filLu();
        $this->assertTrue($this->accuse($autre, $id, 'Le bien est-il libre ?'));

        Sanctum::actingAs($moi);
        $this->putJson("/api/conversations/{$id}/unread")->assertOk();

        $this->assertFalse($this->accuse($autre, $id, 'Le bien est-il libre ?'));
        $this->assertTrue($this->accuse($autre, $id, 'Bonjour'), 'les messages plus anciens restent lus');
    }

    private function accuse(User $auteur, int $id, string $texte): ?bool
    {
        Sanctum::actingAs($auteur);
        $message = collect($this->getJson("/api/conversations/{$id}/messages")->assertOk()->json('data'))
            ->firstWhere('content', $texte);
        $this->assertNotNull($message, $texte);

        return $message['read_by_recipient'];
    }

    public function test_idempotent_et_ne_rend_pas_lu_un_fil_deja_non_lu(): void
    {
        [$moi, , $id] = $this->filLu();
        Sanctum::actingAs($moi);
        $this->putJson("/api/conversations/{$id}/unread")->assertOk();
        $premier = $this->lecture($moi, $id);

        $this->travel(3)->minutes();
        $this->putJson("/api/conversations/{$id}/unread")->assertOk();
        $this->assertSame($premier, $this->lecture($moi, $id));
        $this->assertSame(1, $this->comptes($moi)[0]);

        // Jamais lu : le `last_read_at` nul (tout est non lu) n'est pas avancé.
        ConversationParticipant::query()->where('conversation_id', $id)->where('user_id', $moi->id)
            ->update(['last_read_at' => null]);
        Sanctum::actingAs($moi);
        $this->putJson("/api/conversations/{$id}/unread")->assertOk();
        $this->assertNull($this->lecture($moi, $id));
        $this->assertSame(2, $this->comptes($moi)[0]);
    }

    public function test_un_avis_systeme_ou_mon_propre_message_ne_compte_pas_comme_dernier(): void
    {
        [$moi, , $id] = $this->filLu();

        // Après le dernier message de l'autre : ma réponse, puis un avis système.
        $this->travel(1)->minutes();
        Sanctum::actingAs($moi);
        $this->postJson("/api/conversations/{$id}/messages", ['content' => 'Oui'])->assertCreated();
        $this->travel(1)->minutes();
        Message::query()->create([
            'conversation_id' => $id,
            'sender_id' => null,
            'type' => MessageType::System->value,
            'content' => 'avis',
        ]);

        $this->putJson("/api/conversations/{$id}/unread")->assertOk();
        $this->assertSame(1, $this->comptes($moi)[0]);
    }

    public function test_sans_message_d_un_autre_rien_ne_change(): void
    {
        Queue::fake();
        $agence = Agency::factory()->create();
        $moi = User::factory()->create();
        $autre = User::factory()->create();
        $this->materializeRoleProfile($moi, 'agent', $agence);
        $this->materializeRoleProfile($autre, 'agent', $agence);
        Sanctum::actingAs($moi);
        $id = $this->postJson('/api/conversations', ['participants' => [$autre->id], 'initial_message' => 'Bonjour'])
            ->assertCreated()->json('data.id');
        $this->putJson("/api/conversations/{$id}/read")->assertOk();
        $avant = $this->lecture($moi, $id);

        $this->travel(1)->minutes();
        $this->putJson("/api/conversations/{$id}/unread")->assertOk();
        $this->assertSame($avant, $this->lecture($moi, $id));
        $this->assertSame(0, $this->comptes($moi)[0]);
    }

    public function test_un_non_participant_est_refuse(): void
    {
        [, , $id] = $this->filLu();
        $tiers = User::factory()->create();
        Sanctum::actingAs($tiers);
        $this->putJson("/api/conversations/{$id}/unread")->assertForbidden();
        $this->assertSame(2, Conversation::query()->findOrFail($id)->participants()->count());
    }

    private function lecture(User $lecteur, int $id): ?string
    {
        $valeur = ConversationParticipant::query()->where('conversation_id', $id)->where('user_id', $lecteur->id)
            ->value('last_read_at');

        return $valeur === null ? null : (string) $valeur;
    }
}
