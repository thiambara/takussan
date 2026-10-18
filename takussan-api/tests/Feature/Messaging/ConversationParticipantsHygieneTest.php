<?php

namespace Tests\Feature\Messaging;

use App\Models\AppNotification;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-861 (P38.07) — quatre écarts de la gestion des participants :
 *
 *  1. l'invitation à un groupe partait sans `code` ni `target` (ADR-0032) : la cloche n'en faisait
 *     pas un lien, et son titre restait dans la langue de l'envoi ;
 *  2. une directe pouvait être « quittée » par `DELETE …/participants/{soi}` ;
 *  3. la liste rendait les anciens membres d'un groupe (nom, avatar) ;
 *  4. une ré-invitation gardait l'ancien `last_read_at` : l'absence comptait en non-lus.
 */
class ConversationParticipantsHygieneTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: User, 2: User, 3: Conversation} */
    private function groupe(): array
    {
        $admin = User::factory()->create();
        $b = User::factory()->create();
        $c = User::factory()->create();

        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Chantier',
            'created_by' => $admin->id,
        ]);
        $conversation->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $conversation->participants()->attach($b->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        $conversation->participants()->attach($c->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        return [$admin, $b, $c, $conversation];
    }

    private function quitte(Conversation $conversation, User $user, array $extra = []): void
    {
        DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $user->id)
            ->update(['left_at' => now()->subDay()] + $extra);
    }

    public function test_l_invitation_porte_son_code_ses_parametres_et_la_cible_du_groupe(): void
    {
        [$admin, $b, $c, $conversation] = $this->groupe();
        $admin->forceFill(['first_name' => 'Awa', 'last_name' => 'Diop'])->save();
        $this->quitte($conversation, $c);

        Sanctum::actingAs($admin);
        $this->postJson("/api/conversations/{$conversation->id}/participants", ['user_ids' => [$c->id]])
            ->assertCreated();

        $ligne = AppNotification::query()->where('user_id', $c->id)->sole();
        $this->assertSame('message.group_invite', $ligne->code);
        $this->assertSame(['inviter' => 'Awa Diop', 'subject' => 'Chantier'], $ligne->params);
        $this->assertSame('conversation', $ligne->target['kind'] ?? null);
        $this->assertSame($conversation->id, $ligne->target['id'] ?? null);
    }

    public function test_une_directe_ne_se_quitte_pas(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $directe = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'created_by' => $a->id,
        ]);
        $directe->participants()->attach([$a->id => ['joined_at' => now()], $b->id => ['joined_at' => now()]]);

        Sanctum::actingAs($a);
        $this->deleteJson("/api/conversations/{$directe->id}/participants/{$a->id}")->assertForbidden();

        $this->assertNull(DB::table('conversation_participants')
            ->where('conversation_id', $directe->id)->where('user_id', $a->id)->value('left_at'));
    }

    public function test_la_liste_ne_rend_pas_les_anciens_membres(): void
    {
        [$admin, $b, $c, $conversation] = $this->groupe();
        $this->quitte($conversation, $c);

        Sanctum::actingAs($admin);
        $ligne = collect($this->getJson('/api/conversations')->assertOk()->json('data'))
            ->firstWhere('id', $conversation->id);

        $this->assertNotNull($ligne);
        $this->assertEqualsCanonicalizing(
            [$admin->id, $b->id],
            collect($ligne['participants'])->pluck('user_id')->all(),
        );
    }

    public function test_une_reinvitation_ne_compte_pas_l_absence_en_non_lus(): void
    {
        [$admin, $b, $c, $conversation] = $this->groupe();
        $this->quitte($conversation, $c, ['last_read_at' => now()->subDays(2)]);

        $message = Message::create([
            'conversation_id' => $conversation->id,
            'sender_id' => $b->id,
            'content' => 'écrit pendant l\'absence',
            'type' => MessageType::Text->value,
        ]);
        $message->forceFill(['created_at' => now()->subHour()])->save();

        Sanctum::actingAs($admin);
        $this->postJson("/api/conversations/{$conversation->id}/participants", ['user_ids' => [$c->id]])
            ->assertCreated();

        Sanctum::actingAs($c);
        $ligne = collect($this->getJson('/api/conversations')->assertOk()->json('data'))
            ->firstWhere('id', $conversation->id);

        $this->assertNotNull($ligne);
        $this->assertSame(0, $ligne['unread_count']);
    }
}
