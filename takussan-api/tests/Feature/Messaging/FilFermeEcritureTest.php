<?php

namespace Tests\Feature\Messaging;

use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2957 (AC4, ADR-0128 § 1) — un fil `closed` n'accepte plus d'écriture : l'envoi répond 403
 * (`SendMessageConversationRequest::authorize` lit `ConversationAccess::allowsWriting`) et
 * `abilities.can_send_message` cache la saisie. La lecture ne change pas.
 *
 * Le fil est fermé PAR LE TEST, son objet existe toujours : seule la fermeture est éprouvée, pas la
 * suppression. Le témoin — le même fil `active` — reçoit l'envoi, sinon le 403 ne prouverait rien.
 */
class FilFermeEcritureTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return array{Conversation, User} */
    private function fil(ConversationStatus $status): array
    {
        $booking = Booking::factory()->create();
        $membre = User::factory()->create();
        $autre = User::factory()->create();
        $fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => $status->value,
            'subject' => 'Réservation',
            'created_by' => $membre->id,
            'subject_type' => 'booking',
            'subject_id' => $booking->id,
        ]);
        $fil->participants()->attach($membre->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $fil->participants()->attach($autre->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        return [$fil, $membre];
    }

    public function test_un_fil_ferme_refuse_l_envoi_et_cache_la_saisie_mais_se_lit(): void
    {
        [$fil, $membre] = $this->fil(ConversationStatus::Closed);
        $this->actingAsApi($membre);

        $this->apiPost("/api/conversations/{$fil->id}/messages", ['content' => 'Encore là ?'])->assertForbidden();
        $this->assertSame(0, $fil->messages()->count());

        $this->apiGet("/api/conversations/{$fil->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'closed')
            ->assertJsonPath('data.subject_type', 'booking')
            ->assertJsonPath('data.abilities.can_send_message', false);
        $this->apiGet("/api/conversations/{$fil->id}/messages")->assertOk();
    }

    public function test_temoin_le_meme_fil_actif_recoit_l_envoi(): void
    {
        [$fil, $membre] = $this->fil(ConversationStatus::Active);
        $this->actingAsApi($membre);

        $this->apiPost("/api/conversations/{$fil->id}/messages", ['content' => 'Bonjour'])->assertCreated();
        $this->apiGet("/api/conversations/{$fil->id}")
            ->assertOk()
            ->assertJsonPath('data.abilities.can_send_message', true);
    }
}
