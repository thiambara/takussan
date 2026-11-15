<?php

namespace Tests\Feature\Messaging;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Lease;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2859 (ADR-0114 § 3) — ajouter quelqu'un à un fil à deux crée un GROUPE neuf (l'appelant, l'autre
 * partie, la personne ajoutée), sans l'historique ; la directe reste telle quelle. La personne ajoutée
 * doit être joignable par l'appelant pour ce fil (`MessagingReach`) : jamais un client d'une autre agence.
 */
class DirectConversationAddParticipantTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $malick;

    private User $awa;

    private int $directe;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();

        $this->agence = Agency::factory()->create();
        $this->agent = User::factory()->create(['first_name' => 'Ousmane', 'last_name' => 'Agent']);
        $this->awa = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Collègue']);
        $this->malick = User::factory()->create(['first_name' => 'Malick', 'last_name' => 'Client']);
        $this->materializeRoleProfile($this->agent, 'agent', $this->agence);
        $this->materializeRoleProfile($this->awa, 'agent', $this->agence);
        $this->materializeRoleProfile($this->malick, 'owner', $this->agence);

        Sanctum::actingAs($this->agent);
        $this->directe = $this->postJson('/api/conversations', [
            'participants' => [$this->malick->id],
            'initial_message' => 'Bonjour Malick, votre dossier avance.',
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($this->malick);
        $this->postJson("/api/conversations/{$this->directe}/messages", ['content' => 'Merci, une question privée.'])
            ->assertCreated();
    }

    public function test_ac3_ajouter_une_collegue_cree_un_groupe_a_trois_sans_historique(): void
    {
        Sanctum::actingAs($this->agent);
        $r = $this->postJson("/api/conversations/{$this->directe}/participants", ['user_ids' => [$this->awa->id]])
            ->assertCreated()
            ->assertJsonPath('data.type', ConversationType::Group->value);

        $groupeId = (int) $r->json('data.id');
        $this->assertNotSame($this->directe, $groupeId);

        $groupe = Conversation::query()->findOrFail($groupeId);
        $this->assertSame(ConversationType::Group, $groupe->type);
        $membres = $groupe->participants()->wherePivotNull('left_at')->pluck('users.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        $this->assertSame(collect([$this->agent->id, $this->awa->id, $this->malick->id])->sort()->values()->all(), $membres);
        $this->assertSame(
            ParticipantRole::Admin->value,
            $groupe->participants()->where('users.id', $this->agent->id)->first()->pivot->role instanceof ParticipantRole
                ? $groupe->participants()->where('users.id', $this->agent->id)->first()->pivot->role->value
                : $groupe->participants()->where('users.id', $this->agent->id)->first()->pivot->role,
        );
        $this->assertSame(0, Message::withTrashed()->where('conversation_id', $groupeId)->count(), 'aucun message, aucun avis système');

        // La directe reste : ses deux messages, ses deux participants actifs.
        $directe = Conversation::query()->findOrFail($this->directe);
        $this->assertSame(ConversationType::Direct, $directe->type);
        $this->assertSame(2, Message::query()->where('conversation_id', $this->directe)->count());
        $this->assertSame(2, $directe->participants()->wherePivotNull('left_at')->count());

        // Awa lit le groupe, pas la directe.
        Sanctum::actingAs($this->awa);
        $this->getJson("/api/conversations/{$groupeId}")->assertOk();
        $this->getJson("/api/conversations/{$this->directe}")->assertForbidden();
    }

    public function test_ac4_un_client_d_une_autre_agence_est_refuse_sans_fil_cree(): void
    {
        $ailleurs = User::factory()->create();
        $this->materializeRoleProfile($ailleurs, 'owner', Agency::factory()->create());
        $avant = Conversation::query()->count();

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/conversations/{$this->directe}/participants", ['user_ids' => [$ailleurs->id]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('user_ids');

        $this->assertSame($avant, Conversation::query()->count());
    }

    /** Ajouter l'autre partie, ou soi-même, n'ajoute personne : pas de « groupe » à deux. */
    public function test_n_ajouter_personne_de_neuf_ne_cree_aucun_groupe(): void
    {
        $avant = Conversation::query()->count();
        Sanctum::actingAs($this->agent);

        foreach ([[$this->malick->id], [$this->agent->id], [$this->malick->id, $this->agent->id]] as $ids) {
            $this->postJson("/api/conversations/{$this->directe}/participants", ['user_ids' => $ids])
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['user_ids' => __('messaging.errors.participants_required')]);
        }

        $this->assertSame($avant, Conversation::query()->count());
    }

    public function test_le_selecteur_d_une_directe_liste_ce_que_l_ajout_accepte(): void
    {
        $ailleurs = User::factory()->create();
        $this->materializeRoleProfile($ailleurs, 'owner', Agency::factory()->create());

        Sanctum::actingAs($this->agent);
        $ids = collect($this->getJson("/api/conversations/{$this->directe}/contacts?per_page=50")->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();

        $this->assertContains($this->awa->id, $ids);
        $this->assertNotContains($ailleurs->id, $ids);
        // Les deux membres de la directe n'y sont pas proposés.
        $this->assertNotContains($this->malick->id, $ids);
    }

    public function test_un_non_participant_ne_peut_rien_ajouter(): void
    {
        Sanctum::actingAs($this->awa);
        $this->postJson("/api/conversations/{$this->directe}/participants", ['user_ids' => [$this->awa->id]])
            ->assertForbidden();
        $this->getJson("/api/conversations/{$this->directe}/contacts")->assertForbidden();
    }

    public function test_le_sujet_envoye_nomme_le_groupe(): void
    {
        Sanctum::actingAs($this->agent);
        $this->postJson("/api/conversations/{$this->directe}/participants", [
            'user_ids' => [$this->awa->id],
            'subject' => 'Dossier Malick',
        ])->assertCreated()->assertJsonPath('data.subject', 'Dossier Malick');
    }

    /**
     * Le groupe reprend le bail de la directe : la borne de TCK-2191 s'applique (qui ne lit pas ce
     * bail n'y entre pas), alors que `AddParticipantsRequest` ne la jouait que pour l'administrateur
     * d'un groupe.
     */
    public function test_le_groupe_reprend_le_bail_de_la_directe_et_sa_borne(): void
    {
        ['agency' => $agency, 'property' => $property, 'tenant' => $tenant] = $this->maintenanceScenario();
        $lease = Lease::query()->where('property_id', $property->id)->sole();
        $lease->forceFill(['agency_id' => $agency->id])->save();
        $agent = $this->agentOf($agency);
        $collegue = $this->agentOf($agency);
        $tiers = User::factory()->create();

        $directe = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'created_by' => $agent->id,
            'lease_id' => $lease->id,
        ]);
        $directe->participants()->attach([
            $agent->id => ['role' => ParticipantRole::Member->value, 'joined_at' => now()],
            $tenant->id => ['role' => ParticipantRole::Member->value, 'joined_at' => now()],
        ]);
        // Correspondants de l'agent : la joignabilité n'est pas ce qui refuse.
        foreach ([$tiers, $collegue] as $autre) {
            Conversation::create(['type' => ConversationType::Direct->value, 'status' => ConversationStatus::Active->value, 'created_by' => $agent->id])
                ->participants()->attach([$agent->id => ['joined_at' => now()], $autre->id => ['joined_at' => now()]]);
        }
        $this->assertFalse($tiers->can('view', $lease));
        $avant = Conversation::query()->where('type', ConversationType::Group->value)->count();

        Sanctum::actingAs($agent);
        $this->postJson("/api/conversations/{$directe->id}/participants", ['user_ids' => [$tiers->id]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['user_ids' => __('messaging.errors.participants_cannot_read_lease')]);
        $this->assertSame($avant, Conversation::query()->where('type', ConversationType::Group->value)->count());

        $groupeId = $this->postJson("/api/conversations/{$directe->id}/participants", ['user_ids' => [$collegue->id]])
            ->assertCreated()->json('data.id');
        $this->assertSame($lease->id, (int) Conversation::query()->findOrFail($groupeId)->lease_id);
    }
}
