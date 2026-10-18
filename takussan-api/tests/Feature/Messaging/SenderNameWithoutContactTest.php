<?php

namespace Tests\Feature\Messaging;

use App\Models\AppNotification;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Property;
use App\Models\User;
use App\Services\Messaging\GroupConversationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P38.06 (TCK-815) — le nom d'un expéditeur, d'un inviteur ou d'un destinataire de contact ne
 * se replie jamais sur son adresse e-mail : prénom et nom, puis `username`, puis « — ». Les trois
 * chemins (`NotifyNewMessageJob`, l'invitation à un groupe, la lecture publique du fil
 * d'une annonce) suivent le même repli, `User::nameWithoutContact()`.
 */
class SenderNameWithoutContactTest extends TestCase
{
    use RefreshDatabase;

    private function nameless(?string $username = null): User
    {
        return User::factory()->create([
            'first_name' => '',
            'last_name' => '',
            'username' => $username,
            'email' => 'secret@example.test',
        ]);
    }

    private function directBetween(User $a, User $b): Conversation
    {
        $conversation = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'created_by' => $a->id,
        ]);
        $conversation->participants()->attach([
            $a->id => ['joined_at' => now()],
            $b->id => ['joined_at' => now()],
        ]);

        return $conversation;
    }

    public function test_un_message_d_un_expediteur_sans_nom_ni_username_epingle_un_tiret(): void
    {
        $sender = $this->nameless();
        $recipient = User::factory()->create();
        $conversation = $this->directBetween($sender, $recipient);
        Sanctum::actingAs($sender);

        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'x'])->assertCreated();

        $notification = AppNotification::where('user_id', $recipient->id)->sole();
        $this->assertSame(['sender' => '—', 'excerpt' => 'x'], $notification->params);
    }

    public function test_un_message_d_un_expediteur_sans_nom_rend_son_username(): void
    {
        $sender = $this->nameless('moussa');
        $recipient = User::factory()->create();
        $conversation = $this->directBetween($sender, $recipient);
        Sanctum::actingAs($sender);

        $this->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'x'])->assertCreated();

        $this->assertSame('moussa', AppNotification::where('user_id', $recipient->id)->sole()->params['sender']);
    }

    public function test_l_invitation_d_un_inviteur_sans_nom_ni_username_ne_porte_pas_son_e_mail(): void
    {
        $inviter = $this->nameless();
        $invitee = User::factory()->create();
        $groupe = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'G',
            'created_by' => $inviter->id,
        ]);
        $groupe->participants()->attach($inviter->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);

        // TCK-861 — l'invitation part par le code `message.group_invite`.
        app(GroupConversationService::class)->addParticipants($groupe, $inviter, [$invitee->id]);

        $ligne = AppNotification::query()->where('user_id', $invitee->id)->sole();
        $this->assertSame('—', $ligne->params['inviter']);
        $this->assertStringNotContainsString('secret@example.test', json_encode([$ligne->params, $ligne->title, $ligne->body]));
    }

    public function test_le_destinataire_d_un_contact_d_annonce_sans_nom_ni_username_ne_porte_pas_son_e_mail(): void
    {
        $owner = $this->nameless();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/public/properties/{$property->slug}/conversation")
            ->assertOk()
            ->assertJsonPath('data.recipient.name', '—');
    }
}
