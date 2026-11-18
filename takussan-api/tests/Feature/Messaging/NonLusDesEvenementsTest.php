<?php

namespace Tests\Feature\Messaging;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\EvenementsDuFil;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2958 (ADR-0128 § 5, AC7) — un message `event` ne compte comme non lu pour PERSONNE (sans auteur,
 * il compterait chez tous jusqu'à TCK-2959 et son `action_for`) ; une `card` compte comme un message
 * d'un autre. Les deux définitions : `$nonLus` (la liste) et sa copie dans `markAsUnread`.
 */
class NonLusDesEvenementsTest extends TestCase
{
    use RefreshDatabase;

    private User $lecteur;

    private User $autre;

    private Conversation $fil;

    protected function setUp(): void
    {
        parent::setUp();

        $this->lecteur = User::factory()->create();
        $this->autre = User::factory()->create();
        $this->fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Intervention',
            'created_by' => $this->autre->id,
        ]);
        $this->fil->participants()->attach($this->autre->id, ['role' => ParticipantRole::Admin->value, 'joined_at' => now()]);
        $this->fil->participants()->attach($this->lecteur->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now(), 'last_read_at' => now()->subDay()]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function evenement(): Message
    {
        return app(EvenementsDuFil::class)->ecrire($this->fil, MaintenanceRequest::factory()->create(), 'maintenance.transition', ['status' => 'in_progress']);
    }

    private function message(MessageType $type): Message
    {
        return Message::create([
            'conversation_id' => $this->fil->id,
            'sender_id' => $this->autre->id,
            'type' => $type->value,
            'content' => $type === MessageType::Card ? 'test.card' : 'Bonjour',
            'metadata' => $type === MessageType::Card ? ['object' => ['type' => 'lease', 'id' => 1], 'code' => 'test.card', 'data' => []] : null,
        ]);
    }

    /** @return array{unread_count: int, unread_total: int} */
    private function compte(): array
    {
        Sanctum::actingAs($this->lecteur);
        $reponse = $this->getJson('/api/conversations')->assertOk();

        return [
            'unread_count' => (int) $reponse->json('data.0.unread_count'),
            'unread_total' => (int) $reponse->json('meta.unread_total'),
        ];
    }

    public function test_un_evenement_ne_compte_pas_dans_la_liste(): void
    {
        $this->evenement();
        $this->evenement();

        $this->assertSame(['unread_count' => 0, 'unread_total' => 0], $this->compte());
    }

    public function test_une_carte_d_un_autre_compte_dans_la_liste(): void
    {
        $this->evenement();
        $this->message(MessageType::Card);

        $this->assertSame(['unread_count' => 1, 'unread_total' => 1], $this->compte());
    }

    /** `markAsUnread` recule la lecture avant le dernier message QUI COMPTE : pas avant un événement plus récent. */
    public function test_marquer_non_lu_ignore_l_evenement(): void
    {
        Carbon::setTestNow('2026-11-18 10:00:00');
        $this->message(MessageType::Text);
        Carbon::setTestNow('2026-11-18 10:05:00');
        $this->evenement();
        Carbon::setTestNow('2026-11-18 10:10:00');
        $this->fil->participants()->updateExistingPivot($this->lecteur->id, ['last_read_at' => now()]);

        Sanctum::actingAs($this->lecteur);
        $this->putJson("/api/conversations/{$this->fil->id}/unread")->assertOk();

        $lecture = $this->fil->participants()->where('users.id', $this->lecteur->id)->first()->pivot->last_read_at;
        $this->assertSame('2026-11-18 09:59:59', Carbon::parse($lecture)->format('Y-m-d H:i:s'));
    }
}
