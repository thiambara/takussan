<?php

namespace Tests\Feature\Api;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1127 (P95.02) — le renommage d'un groupe et le changement de rôle d'un participant rendent
 * la conversation que rend `GET /api/conversations/{id}` : mêmes `participants` (les actifs, avec
 * leur avatar), même `property`. Avant, le renommage ne chargeait que `property`, et le
 * changement de rôle aucune relation : un front qui aurait écrit la réponse dans le cache du
 * détail affichait « 0 participant », le défaut que TCK-576 avait corrigé sur `show`.
 */
class ConversationWriteMatchesShowTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: User, 2: Conversation} */
    private function groupe(): array
    {
        $admin = User::factory()->create();
        $member = User::factory()->create();
        $parti = User::factory()->create();
        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Groupe',
            'created_by' => $admin->id,
            'property_id' => Property::factory()->create()->id,
        ]);
        $conversation->participants()->attach($admin->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $conversation->participants()->attach($member->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
        $conversation->participants()->attach($parti->id, [
            'role' => ParticipantRole::Member->value,
            'joined_at' => now()->subDay(),
            'left_at' => now(),
        ]);

        return [$admin, $member, $conversation];
    }

    private function assertMemeConversationQueShow(TestResponse $ecriture, Conversation $conversation): void
    {
        $show = $this->getJson("/api/conversations/{$conversation->id}")->assertOk();

        $this->assertCount(2, $show->json('data.participants'), 'show ne rend que les membres actifs');
        $this->assertNotNull($show->json('data.property'));
        $this->assertSame($show->json('data.participants'), $ecriture->json('data.participants'));
        $this->assertSame($show->json('data.property'), $ecriture->json('data.property'));
    }

    public function test_le_renommage_rend_les_participants_et_le_bien_de_show(): void
    {
        [$admin, , $conversation] = $this->groupe();

        Sanctum::actingAs($admin);
        $ecriture = $this->patchJson("/api/conversations/{$conversation->id}", ['subject' => 'Nouveau nom'])
            ->assertOk();

        $this->assertMemeConversationQueShow($ecriture, $conversation);
    }

    public function test_le_changement_de_role_rend_les_participants_et_le_bien_de_show(): void
    {
        [$admin, $member, $conversation] = $this->groupe();

        Sanctum::actingAs($admin);
        $ecriture = $this->patchJson("/api/conversations/{$conversation->id}/participants/{$member->id}", [
            'role' => ParticipantRole::Admin->value,
        ])->assertOk();

        $this->assertMemeConversationQueShow($ecriture, $conversation);
    }
}
