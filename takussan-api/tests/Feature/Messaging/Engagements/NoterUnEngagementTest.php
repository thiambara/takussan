<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Commitment;
use App\Models\Conversation;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\OperateursPlateforme;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2969 (ADR-0130 § 2) — noter un engagement : `POST /api/conversations/{c}/commitments`.
 *
 *  - le personnel note pour autrui (`proposed`), un participant note la sienne (`open`) ;
 *  - l'objet rattaché est posé par le serveur : le sujet du fil, sinon son bien ;
 *  - la carte `commitment.noted` désigne l'ENGAGEMENT (AC3), et son `data` ne porte ni titre ni nom ;
 *  - chaque refus de la liste du ticket, avec son code.
 */
class NoterUnEngagementTest extends TestCase
{
    use MaintenanceActors, OperateursPlateforme, RefreshDatabase, SceneDEngagement;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
    }

    /** @param  array<string, mixed>  $corps */
    private function noter(Conversation $fil, array $corps)
    {
        return $this->postJson("/api/conversations/{$fil->id}/commitments", $corps + [
            'title' => 'Repasser pour la fuite',
            'due_at' => now()->addDays(2)->utc()->format('Y-m-d\TH:i:s\Z'),
        ]);
    }

    public function test_le_personnel_note_pour_le_locataire_un_engagement_propose_avec_sa_carte(): void
    {
        $source = $this->message($this->fil, $this->locataire);
        Sanctum::actingAs($this->agent);

        $reponse = $this->noter($this->fil, ['holder_id' => $this->locataire->id, 'source_message_id' => $source->id])
            ->assertCreated()
            ->assertJsonPath('data.status', 'proposed')
            ->assertJsonPath('data.etat', 'proposed')
            ->assertJsonPath('data.holder.id', $this->locataire->id)
            ->assertJsonPath('data.object', ['type' => 'property', 'id' => $this->bien->id]);

        $engagement = Commitment::query()->findOrFail($reponse->json('data.id'));
        $this->assertSame($this->agence->id, $engagement->agency_id);
        $this->assertSame($source->id, $engagement->source_message_id);
        $this->assertSame($this->agent->id, $engagement->created_by_id);

        // AC3 — la carte désigne l'engagement, jamais le sujet du fil ; `data` sans titre ni nom.
        $carte = Message::query()->where('conversation_id', $this->fil->id)->where('type', MessageType::Card->value)->sole();
        $this->assertSame($this->agent->id, $carte->sender_id);
        $this->assertEquals(['type' => 'commitment', 'id' => $engagement->id], $carte->metadata['object']);
        $this->assertSame('commitment.noted', $carte->metadata['code']);
        $brut = json_encode($carte->metadata);
        $this->assertStringNotContainsString('fuite', $brut);
        $this->assertStringNotContainsString($this->locataire->nameWithoutContact(), $brut);
        $this->assertSame([], $carte->metadata['data']);

        // Une table à lui : aucune tâche n'est née.
        $this->assertSame(0, Task::query()->count());
    }

    public function test_un_participant_note_sa_propre_promesse_ouverte_d_emblee(): void
    {
        Sanctum::actingAs($this->locataire);

        $this->noter($this->fil, ['holder_id' => $this->locataire->id, 'beneficiary_id' => $this->voisin->id])
            ->assertCreated()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.etat', 'open')
            ->assertJsonPath('data.beneficiary.id', $this->voisin->id);
    }

    /** AC2 — un participant hors personnel ne note que pour lui. */
    public function test_un_participant_hors_personnel_ne_note_pas_pour_autrui(): void
    {
        Sanctum::actingAs($this->locataire);

        $this->noter($this->fil, ['holder_id' => $this->voisin->id])
            ->assertStatus(422)->assertJsonPath('code', 'commitment.not_yours');
        $this->assertSame(0, Commitment::query()->count());
    }

    /** AC1 — depuis une note d'équipe : refusé, et rien que le locataire puisse lire n'est né. */
    public function test_un_engagement_ne_se_note_pas_depuis_une_note_d_equipe(): void
    {
        $note = $this->message($this->fil, $this->agent, MessageVisibility::Team);
        Sanctum::actingAs($this->agent);

        $this->noter($this->fil, ['holder_id' => $this->agent->id, 'source_message_id' => $note->id])
            ->assertStatus(422)->assertJsonPath('code', 'commitment.team_note_source');

        Sanctum::actingAs($this->locataire);
        $this->getJson("/api/conversations/{$this->fil->id}/commitments")->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_un_message_source_d_un_autre_fil_est_refuse(): void
    {
        $ailleurs = $this->groupe([$this->agent, $this->locataire], ['property_id' => $this->bien->id]);
        $source = $this->message($ailleurs, $this->locataire);
        Sanctum::actingAs($this->agent);

        $this->noter($this->fil, ['holder_id' => $this->locataire->id, 'source_message_id' => $source->id])
            ->assertStatus(422)->assertJsonPath('code', 'commitment.source_elsewhere');
    }

    public function test_porteur_et_beneficiaire_doivent_participer_au_fil(): void
    {
        Sanctum::actingAs($this->agent);

        $this->noter($this->fil, ['holder_id' => $this->etranger->id])
            ->assertStatus(422)->assertJsonPath('code', 'commitment.holder_not_participant');
        $this->noter($this->fil, ['holder_id' => $this->locataire->id, 'beneficiary_id' => $this->etranger->id])
            ->assertStatus(422)->assertJsonPath('code', 'commitment.beneficiary_not_participant');
    }

    public function test_une_echeance_passee_est_refusee(): void
    {
        Sanctum::actingAs($this->agent);

        $this->postJson("/api/conversations/{$this->fil->id}/commitments", [
            'holder_id' => $this->locataire->id,
            'title' => 'Payer',
            'due_at' => now()->subHour()->utc()->format('Y-m-d\TH:i:s\Z'),
        ])->assertStatus(422)->assertJsonPath('code', 'commitment.due_in_past');
    }

    public function test_un_fil_sans_agence_refuse_l_engagement(): void
    {
        $sansAgence = $this->groupe([$this->locataire, $this->voisin]);
        Sanctum::actingAs($this->locataire);

        $this->noter($sansAgence, ['holder_id' => $this->locataire->id])
            ->assertStatus(422)->assertJsonPath('code', 'commitment.no_agency');
    }

    public function test_un_non_participant_et_le_super_admin_sont_refuses(): void
    {
        Sanctum::actingAs($this->etranger);
        $this->noter($this->fil, ['holder_id' => $this->etranger->id])->assertForbidden();

        $superAdmin = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $this->assertTrue($superAdmin->fresh()->isSuperAdmin());
        Sanctum::actingAs($superAdmin->fresh());
        $this->noter($this->fil, ['holder_id' => $this->locataire->id])->assertForbidden();

        $this->assertSame(0, Commitment::query()->count());
    }

    /** L'objet rattaché : le SUJET du fil quand il en a un (ici, une intervention), jamais lu du corps. */
    public function test_l_objet_est_le_sujet_du_fil_et_n_est_jamais_lu_du_corps(): void
    {
        $intervention = MaintenanceRequest::factory()->create(['property_id' => $this->bien->id]);
        $fil = $this->groupe([$this->agent, $this->locataire], [
            'property_id' => $this->bien->id,
            'maintenance_request_id' => $intervention->id,
            'subject_type' => 'maintenance_request',
            'subject_id' => $intervention->id,
        ]);
        Sanctum::actingAs($this->agent);

        $this->noter($fil, [
            'holder_id' => $this->agent->id,
            'object_type' => 'lease',
            'object_id' => 1,
        ])->assertCreated()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.object', ['type' => 'maintenance_request', 'id' => $intervention->id]);

        $this->assertSame(CommitmentStatus::Open, Commitment::query()->sole()->status);
    }
}
