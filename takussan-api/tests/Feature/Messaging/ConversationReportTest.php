<?php

namespace Tests\Feature\Messaging;

use App\Models\Agency;
use App\Models\ConversationReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2859 (ADR-0114 § 2) — signaler une conversation : une ligne par auteur et par fil, motif codé,
 * commentaire libre ≤ 500 ; un participant seulement ; lue par le seul super-admin, sans le contenu
 * des messages. Le signalement ne gèle rien.
 */
class ConversationReportTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: User, 2: int} */
    private function fil(): array
    {
        Queue::fake();
        $agence = Agency::factory()->create();
        $moi = User::factory()->create();
        $autre = User::factory()->create();
        $this->materializeRoleProfile($moi, 'agent', $agence);
        $this->materializeRoleProfile($autre, 'agent', $agence);
        Sanctum::actingAs($autre);
        $id = $this->postJson('/api/conversations', ['participants' => [$moi->id], 'initial_message' => 'Message secret'])
            ->assertCreated()->json('data.id');

        return [$moi, $autre, $id];
    }

    public function test_ac2_un_participant_signale_une_fois(): void
    {
        [$moi, , $id] = $this->fil();
        Sanctum::actingAs($moi);

        $this->postJson("/api/conversations/{$id}/reports", ['reason' => 'harassment', 'comment' => 'Insultes répétées'])
            ->assertCreated()
            ->assertJsonPath('data.conversation_id', $id)
            ->assertJsonPath('data.reason', 'harassment');

        $this->postJson("/api/conversations/{$id}/reports", ['reason' => 'spam'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'conversation.already_reported');

        $this->assertSame(1, ConversationReport::query()->where('conversation_id', $id)->count());
        $this->assertSame('harassment', ConversationReport::query()->where('conversation_id', $id)->value('reason'));

        // Le fil n'est pas gelé : on y écrit toujours.
        $this->postJson("/api/conversations/{$id}/messages", ['content' => 'Toujours ouvert'])->assertCreated();
    }

    public function test_ac2_un_non_participant_est_refuse(): void
    {
        [, , $id] = $this->fil();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/conversations/{$id}/reports", ['reason' => 'spam'])->assertForbidden();
        $this->assertSame(0, ConversationReport::query()->count());
    }

    public function test_un_super_admin_qui_n_est_pas_participant_ne_signale_pas(): void
    {
        [, , $id] = $this->fil();
        $this->actingAsRole('super_admin');

        $this->postJson("/api/conversations/{$id}/reports", ['reason' => 'spam'])->assertForbidden();
    }

    public function test_motif_code_et_commentaire_borne(): void
    {
        [$moi, , $id] = $this->fil();
        Sanctum::actingAs($moi);

        $this->postJson("/api/conversations/{$id}/reports", ['reason' => 'Il est méchant'])->assertUnprocessable()
            ->assertJsonValidationErrors('reason');
        $this->postJson("/api/conversations/{$id}/reports", ['reason' => 'other', 'comment' => str_repeat('a', 501)])
            ->assertUnprocessable()->assertJsonValidationErrors('comment');
        $this->assertSame(0, ConversationReport::query()->count());
    }

    public function test_le_super_admin_lit_les_signalements_sans_le_contenu_des_messages(): void
    {
        [$moi, , $id] = $this->fil();
        Sanctum::actingAs($moi);
        $this->postJson("/api/conversations/{$id}/reports", ['reason' => 'fraud'])->assertCreated();

        // Un participant ne lit pas la file.
        $this->getJson('/api/admin/conversation-reports')->assertForbidden();

        $this->actingAsRole('super_admin');
        $r = $this->getJson('/api/admin/conversation-reports')->assertOk()
            ->assertJsonPath('data.0.conversation_id', $id)
            ->assertJsonPath('data.0.reason', 'fraud')
            ->assertJsonPath('data.0.reporter.id', $moi->id)
            ->assertJsonPath('meta.total', 1);

        $this->assertStringNotContainsString('Message secret', $r->getContent());
    }
}
