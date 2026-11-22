<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Commitment;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\MessageType;
use App\Models\Enums\ParticipantRole;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2970 (ADR-0130 § 3, décision 2 « a + b », AC1, AC2) — rouvrir un engagement déclaré tenu.
 *
 *  - l'autre partie (porteur ou bénéficiaire qui n'a pas déclaré) rouvre UNE fois, et ce droit est
 *    PARTAGÉ entre les deux parties (`party_reopened_at`) : 422 `commitment.already_reopened` ensuite ;
 *  - le déclarant ne rouvre pas sa propre déclaration (403), ni un participant hors des parties (403) ;
 *  - le personnel rouvre toujours, sans consommer le droit des parties ;
 *  - sans bénéficiaire, seul le personnel rouvre.
 *
 * Scène : le locataire porte la promesse, faite au voisin ; l'agent est le personnel.
 */
class RouvrirUnEngagementTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement;

    private User $tiers;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-19 10:00:00');
        $this->monterLaScene();
        $this->tiers = User::factory()->create();
        $this->fil->participants()->attach($this->tiers->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function ouvert(array $attributs = []): Commitment
    {
        return $this->engagement($attributs + [
            'status' => CommitmentStatus::Open,
            'beneficiary_id' => $this->voisin->id,
            'due_at' => now()->addDays(2),
        ]);
    }

    private function tenir(Commitment $engagement, User $acteur): void
    {
        Sanctum::actingAs($acteur);
        $this->postJson("/api/commitments/{$engagement->id}/kept")->assertOk();
    }

    private function rouvrir(Commitment $engagement, User $acteur, ?string $motif = 'Rien n\'a été fait'): TestResponse
    {
        Sanctum::actingAs($acteur);

        return $this->postJson("/api/commitments/{$engagement->id}/reopen", $motif === null ? [] : ['reason' => $motif]);
    }

    public function test_tenu_par_le_porteur_le_beneficiaire_rouvre_une_fois_puis_422(): void
    {
        $engagement = $this->ouvert();
        $this->tenir($engagement, $this->locataire);

        $this->rouvrir($engagement, $this->voisin)->assertOk()->assertJsonPath('data.status', 'open');

        $engagement->refresh();
        $this->assertSame(CommitmentStatus::Open, $engagement->status);
        $this->assertNull($engagement->kept_at);
        $this->assertNull($engagement->kept_by_id);
        $this->assertNotNull($engagement->reopened_at);
        $this->assertNotNull($engagement->party_reopened_at);
        $this->assertSame($this->voisin->id, (int) $engagement->reopened_by_id);
        $this->assertSame('Rien n\'a été fait', $engagement->reopen_reason);

        $evenement = Message::query()->where('conversation_id', $this->fil->id)->where('type', MessageType::Event->value)->latest('id')->firstOrFail();
        $this->assertSame('commitment.reopened', $evenement->metadata['code']);
        $this->assertSame([$this->locataire->id], $evenement->metadata['action_for'], 'Rouvert, il attend de nouveau le porteur.');
        $this->assertSame([], $evenement->metadata['data'], 'Le motif (un texte libre) ne voyage pas dans le metadata.');

        $this->tenir($engagement, $this->locataire);
        $this->rouvrir($engagement, $this->voisin)->assertStatus(422)->assertJsonPath('code', 'commitment.already_reopened');
        $this->assertSame(CommitmentStatus::Kept, $engagement->refresh()->status);
    }

    public function test_tenu_par_le_beneficiaire_le_porteur_rouvre(): void
    {
        $engagement = $this->ouvert();
        $this->tenir($engagement, $this->voisin);

        $this->rouvrir($engagement, $this->locataire)->assertOk();

        $this->assertNotNull($engagement->refresh()->party_reopened_at);
        $this->assertSame(CommitmentStatus::Open, $engagement->status);
    }

    /** AC1 — le droit est UNIQUE et PARTAGÉ : après le bénéficiaire, le porteur n'a plus de réouverture. */
    public function test_apres_une_reouverture_par_une_partie_l_autre_est_refusee(): void
    {
        $engagement = $this->ouvert();
        // Déclaré par le personnel : les deux parties sont « l'autre partie ».
        $this->tenir($engagement, $this->agent);
        $this->rouvrir($engagement, $this->voisin)->assertOk();

        $this->tenir($engagement, $this->agent);
        $this->rouvrir($engagement, $this->locataire)->assertStatus(422)->assertJsonPath('code', 'commitment.already_reopened');

        // La projection ne l'offre plus aux parties, et l'offre toujours au personnel.
        Sanctum::actingAs($this->locataire);
        $ligne = collect($this->getJson("/api/conversations/{$this->fil->id}/commitments")->assertOk()->json('data'))->firstWhere('id', $engagement->id);
        $this->assertFalse($ligne['abilities']['reopen']);
        Sanctum::actingAs($this->agent);
        $ligne = collect($this->getJson("/api/conversations/{$this->fil->id}/commitments")->assertOk()->json('data'))->firstWhere('id', $engagement->id);
        $this->assertTrue($ligne['abilities']['reopen']);
    }

    public function test_le_declarant_ne_rouvre_pas_sa_propre_declaration(): void
    {
        $engagement = $this->ouvert();
        $this->tenir($engagement, $this->locataire);

        $this->rouvrir($engagement, $this->locataire)->assertForbidden();

        $this->assertSame(CommitmentStatus::Kept, $engagement->refresh()->status);
        $this->assertNull($engagement->party_reopened_at);

        $this->tenir($autre = $this->ouvert(), $this->voisin);
        $this->rouvrir($autre, $this->voisin)->assertForbidden();
    }

    public function test_un_participant_hors_des_parties_ne_rouvre_pas(): void
    {
        $engagement = $this->ouvert();
        $this->tenir($engagement, $this->locataire);

        $this->rouvrir($engagement, $this->tiers)->assertForbidden();
        $this->rouvrir($engagement, $this->etranger)->assertForbidden();

        $this->assertSame(CommitmentStatus::Kept, $engagement->refresh()->status);
    }

    public function test_le_personnel_rouvre_deux_fois_sans_consommer_le_droit(): void
    {
        $engagement = $this->ouvert();
        $this->tenir($engagement, $this->locataire);
        $this->rouvrir($engagement, $this->agent)->assertOk();
        $this->assertNull($engagement->refresh()->party_reopened_at, 'Le personnel ne consomme pas le droit des parties.');

        $this->tenir($engagement, $this->locataire);
        $this->rouvrir($engagement, $this->agent)->assertOk();
        $this->assertSame(CommitmentStatus::Open, $engagement->refresh()->status);
        $this->assertNull($engagement->party_reopened_at);
    }

    public function test_le_personnel_rouvre_puis_une_partie_rouvre_encore_une_fois(): void
    {
        $engagement = $this->ouvert();
        $this->tenir($engagement, $this->locataire);
        $this->rouvrir($engagement, $this->agent)->assertOk();

        $this->tenir($engagement, $this->locataire);
        $this->rouvrir($engagement, $this->voisin)->assertOk();
        $this->assertNotNull($engagement->refresh()->party_reopened_at);
    }

    /** Le personnel tranche toujours, même s'il a lui-même déclaré tenu (une erreur se rattrape par lui). */
    public function test_le_personnel_rouvre_sa_propre_declaration(): void
    {
        $engagement = $this->ouvert();
        $this->tenir($engagement, $this->agent);

        $this->rouvrir($engagement, $this->agent)->assertOk();
    }

    public function test_le_motif_est_exige(): void
    {
        $engagement = $this->ouvert();
        $this->tenir($engagement, $this->locataire);

        $this->rouvrir($engagement, $this->voisin, null)->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->rouvrir($engagement, $this->voisin, 'ab')->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->rouvrir($engagement, $this->voisin, str_repeat('a', 501))->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->assertSame(CommitmentStatus::Kept, $engagement->refresh()->status);
    }

    public function test_sans_beneficiaire_seul_le_personnel_rouvre(): void
    {
        $engagement = $this->ouvert(['beneficiary_id' => null]);
        $this->tenir($engagement, $this->agent);

        $this->rouvrir($engagement, $this->locataire)->assertForbidden();
        $this->rouvrir($engagement, $this->voisin)->assertForbidden();

        $this->rouvrir($engagement, $this->agent)->assertOk();
    }

    public function test_un_engagement_qui_n_est_pas_tenu_ne_se_rouvre_pas(): void
    {
        $engagement = $this->ouvert();

        $this->rouvrir($engagement, $this->agent)->assertStatus(422)->assertJsonPath('code', 'commitment.invalid_state');
    }

    /** Un porteur qui est aussi le personnel (l'agent s'engage) : le personnel tranche, sans consommer. */
    public function test_un_agent_porteur_rouvre_comme_personnel(): void
    {
        $engagement = $this->ouvert(['holder_id' => $this->agent->id, 'beneficiary_id' => $this->locataire->id]);
        $this->tenir($engagement, $this->agent);

        $this->rouvrir($engagement, $this->agent)->assertOk();
        $this->assertNull($engagement->refresh()->party_reopened_at);
    }
}
