<?php

namespace Tests\Unit\Policies;

use App\Models\Conversation;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\User;
use App\Policies\ConversationPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-285 — `ConversationPolicy::toggleMute` (0/1) et `::modifyMessage` (0/2).
 *
 * `modifyMessage` est la seule chose qui rende les messages système
 * IMMUABLES. Ces messages sont la trace de ce qui s'est passé dans une
 * conversation — qui a rejoint, qui a été retiré, quand le groupe a été
 * renommé. Pouvoir les éditer ou les supprimer, c'est pouvoir réécrire la
 * piste d'audit après coup, et un admin de groupe ne doit pas plus le
 * pouvoir qu'un membre. La policy le dit dans son docblock ; rien ne le
 * vérifiait.
 */
class ConversationPolicyTest extends TestCase
{
    use RefreshDatabase;

    private ConversationPolicy $policy;

    protected function setUp(): void
    {
        parent::setUp();

        $this->policy = new ConversationPolicy;
    }

    // ─── toggleMute ──────────────────────────────────────────────

    public function test_an_active_participant_can_mute_the_conversation(): void
    {
        [$conversation, $user] = $this->conversationWithParticipant();

        $this->assertTrue($this->policy->toggleMute($user, $conversation));
    }

    public function test_a_simple_member_can_mute_without_being_admin(): void
    {
        // `is_muted` est une préférence PERSONNELLE : contrairement à
        // `rename` ou `promote`, elle ne demande pas le rôle admin. Ce test
        // fige cette asymétrie, qui est facile à « corriger » par erreur en
        // alignant toutes les méthodes sur `isActiveAdmin`.
        [$conversation, $user] = $this->conversationWithParticipant(ParticipantRole::Member);

        $this->assertTrue($this->policy->toggleMute($user, $conversation));
    }

    public function test_a_participant_who_left_can_no_longer_mute(): void
    {
        [$conversation, $user] = $this->conversationWithParticipant(
            ParticipantRole::Member,
            leftAt: now()->subDay(),
        );

        $this->assertFalse($this->policy->toggleMute($user, $conversation));
    }

    public function test_a_stranger_to_the_conversation_cannot_mute_it(): void
    {
        [$conversation] = $this->conversationWithParticipant();

        $this->assertFalse($this->policy->toggleMute(User::factory()->create(), $conversation));
    }

    // ─── modifyMessage ───────────────────────────────────────────

    public function test_an_ordinary_message_can_be_modified(): void
    {
        $message = Message::factory()->create(['type' => MessageType::Text]);

        $this->assertTrue($this->policy->modifyMessage(User::factory()->create(), $message));
    }

    public function test_a_system_message_is_immutable(): void
    {
        // L'intégrité de la piste d'audit : personne ne réécrit l'histoire
        // d'une conversation.
        $message = Message::factory()->create(['type' => MessageType::System]);

        $this->assertFalse($this->policy->modifyMessage(User::factory()->create(), $message));
    }

    public function test_a_system_message_is_immutable_even_for_the_group_admin(): void
    {
        // Le cas explicitement annoncé par le docblock de la policy : « Even
        // an admin cannot edit/delete them ». L'immuabilité est une propriété
        // du MESSAGE, pas un manque de droits de l'acteur.
        [$conversation, $admin] = $this->conversationWithParticipant(ParticipantRole::Admin);
        $message = Message::factory()->create([
            'conversation_id' => $conversation->id,
            'sender_id' => $admin->id,
            'type' => MessageType::System,
        ]);

        $this->assertFalse($this->policy->modifyMessage($admin, $message));
    }

    public function test_the_other_content_types_stay_modifiable(): void
    {
        // Le témoin qui empêche « tout est immuable » de passer pour la
        // garde : seul `system` est bloqué, image et document ne le sont pas.
        foreach ([MessageType::Image, MessageType::Document] as $type) {
            $message = Message::factory()->create(['type' => $type]);

            $this->assertTrue(
                $this->policy->modifyMessage(User::factory()->create(), $message),
                "Un message de type {$type->value} doit rester modifiable.",
            );
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────

    /** @return array{0: Conversation, 1: User} */
    private function conversationWithParticipant(
        ParticipantRole $role = ParticipantRole::Admin,
        ?\DateTimeInterface $leftAt = null,
    ): array {
        $user = User::factory()->create();
        $conversation = Conversation::factory()->create(['type' => ConversationType::Group]);

        $conversation->participants()->attach($user->id, [
            'role' => $role->value,
            'joined_at' => now()->subWeek(),
            'left_at' => $leftAt,
            'is_muted' => false,
        ]);

        return [$conversation->fresh(), $user->fresh()];
    }
}
