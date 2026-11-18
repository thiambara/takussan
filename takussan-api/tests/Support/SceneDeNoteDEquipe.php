<?php

namespace Tests\Support;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\ParticipantRole;
use App\Models\Lease;
use App\Models\Message;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

/**
 * TCK-2965 (ADR-0128 § 6) — la scène de la note d'équipe : un groupe rattaché au bail d'une agence A,
 * où écrivent l'agent du bail (l'auteur des notes) et un collègue de A (le lecteur témoin, qui lit les
 * notes), et où lisent trois lecteurs qui ne les lisent pas : le locataire, le bailleur, et un agent
 * d'une autre agence B ajouté au groupe.
 */
trait SceneDeNoteDEquipe
{
    protected Agency $agence;

    protected Property $bien;

    protected Lease $bail;

    protected Conversation $fil;

    protected User $auteur;

    protected User $collegue;

    protected User $locataire;

    protected User $bailleur;

    protected User $agentAilleurs;

    protected function monterLaScene(): void
    {
        $this->agence = Agency::factory()->create();
        $this->bailleur = User::factory()->create();
        OwnerProfile::query()->firstOrCreate(['user_id' => $this->bailleur->id, 'agency_id' => $this->agence->id]);
        $this->bien = Property::factory()->create(['user_id' => $this->bailleur->id, 'agency_id' => $this->agence->id]);
        $this->auteur = $this->agentDeLAgence($this->agence);
        $this->collegue = $this->agentDeLAgence($this->agence);
        $this->locataire = User::factory()->create();
        $fiche = Customer::factory()->create(['user_id' => $this->locataire->id, 'agency_id' => $this->agence->id]);
        $this->bail = Lease::factory()->create([
            'property_id' => $this->bien->id,
            'agency_id' => $this->agence->id,
            'landlord_id' => $this->bailleur->id,
            'agent_id' => $this->auteur->id,
            'tenant_id' => $fiche->id,
            'status' => LeaseStatus::Active,
        ]);
        $this->agentAilleurs = $this->agentDeLAgence(Agency::factory()->create());

        $this->fil = $this->groupe([$this->auteur, $this->collegue, $this->locataire, $this->bailleur, $this->agentAilleurs], [
            'lease_id' => $this->bail->id,
            'property_id' => $this->bien->id,
        ]);
    }

    protected function agentDeLAgence(Agency $agence): User
    {
        $user = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $user->id, 'agency_id' => $agence->id]);

        return $user;
    }

    /**
     * Un groupe dont le premier membre est l'administrateur.
     *
     * @param  list<User>  $membres
     * @param  array<string, mixed>  $attributs
     */
    protected function groupe(array $membres, array $attributs = []): Conversation
    {
        $fil = Conversation::create(array_merge([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Suivi du bail',
            'created_by' => $membres[0]->id,
        ], $attributs));
        foreach ($membres as $i => $membre) {
            $fil->participants()->attach($membre->id, [
                'role' => ($i === 0 ? ParticipantRole::Admin : ParticipantRole::Member)->value,
                'joined_at' => now(),
            ]);
        }

        return $fil;
    }

    /** @return list<User> les trois lecteurs qui ne lisent pas les notes */
    protected function nonLecteurs(): array
    {
        return [$this->locataire, $this->bailleur, $this->agentAilleurs];
    }

    /** Une note d'équipe écrite par la route, au nom de `$auteur` (l'auteur de la scène par défaut). */
    protected function ecrireUneNote(string $texte, ?User $auteur = null, ?Conversation $fil = null): Message
    {
        Sanctum::actingAs($auteur ?? $this->auteur);
        $id = $this->postJson('/api/conversations/'.($fil ?? $this->fil)->id.'/messages', [
            'content' => $texte,
            'visibility' => 'team',
        ])->assertCreated()->json('data.id');

        return Message::query()->findOrFail($id);
    }

    /** Un message `all`, écrit par la route. */
    protected function ecrireUnMessage(string $texte, ?User $auteur = null, ?Conversation $fil = null): Message
    {
        Sanctum::actingAs($auteur ?? $this->auteur);
        $id = $this->postJson('/api/conversations/'.($fil ?? $this->fil)->id.'/messages', [
            'content' => $texte,
        ])->assertCreated()->json('data.id');

        return Message::query()->findOrFail($id);
    }
}
