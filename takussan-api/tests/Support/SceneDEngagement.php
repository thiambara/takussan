<?php

namespace Tests\Support;

use App\Models\Agency;
use App\Models\Commitment;
use App\Models\Conversation;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\Property;
use App\Models\User;

/**
 * TCK-2969 — la scène des engagements : une agence, son agent, un locataire et un autre participant dans un
 * groupe rattaché à un bien de l'agence (l'agence du fil), et un étranger qui n'y est pas.
 *
 * Exige `MaintenanceActors` (`agentOf`).
 */
trait SceneDEngagement
{
    protected Agency $agence;

    protected User $agent;

    protected User $locataire;

    protected User $voisin;

    protected User $etranger;

    protected Property $bien;

    protected Conversation $fil;

    protected function monterLaScene(): void
    {
        $this->agence = Agency::factory()->create();
        $this->agent = $this->agentOf($this->agence, ['phone' => '+221770001001']);
        $this->locataire = User::factory()->create(['phone' => '+221770001002', 'email' => 'locataire@example.test']);
        $this->voisin = User::factory()->create(['phone' => '+221770001003']);
        $this->etranger = User::factory()->create();
        $this->bien = Property::factory()->create(['agency_id' => $this->agence->id]);
        $this->fil = $this->groupe([$this->agent, $this->locataire, $this->voisin], ['property_id' => $this->bien->id]);
    }

    /**
     * @param  list<User>  $membres
     * @param  array<string, mixed>  $attributs
     */
    protected function groupe(array $membres, array $attributs = []): Conversation
    {
        $fil = Conversation::create($attributs + [
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Coordination',
            'created_by' => $membres[0]->id,
        ]);
        foreach ($membres as $i => $membre) {
            $fil->participants()->attach($membre->id, ['role' => ($i === 0 ? ParticipantRole::Admin : ParticipantRole::Member)->value, 'joined_at' => now()]);
        }

        return $fil;
    }

    protected function message(Conversation $fil, User $auteur, MessageVisibility $visibilite = MessageVisibility::All): Message
    {
        return Message::create([
            'conversation_id' => $fil->id,
            'sender_id' => $auteur->id,
            'type' => MessageType::Text->value,
            'content' => 'Je repasse jeudi à 10 h',
            'visibility' => $visibilite->value,
        ]);
    }

    /** @param  array<string, mixed>  $attributs */
    protected function engagement(array $attributs = []): Commitment
    {
        return Commitment::factory()->create($attributs + [
            'conversation_id' => $this->fil->id,
            'agency_id' => $this->agence->id,
            'holder_id' => $this->locataire->id,
            'created_by_id' => $this->agent->id,
            'status' => CommitmentStatus::Proposed,
            'object_type' => 'property',
            'object_id' => $this->bien->id,
        ]);
    }
}
