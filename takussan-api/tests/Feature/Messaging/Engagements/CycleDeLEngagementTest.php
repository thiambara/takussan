<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Commitment;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\MessageType;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Message;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\OperateursPlateforme;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2969 (ADR-0130 §§ 2 et 3) — confirmer et annuler un engagement.
 *
 *  - confirmer : le seul porteur d'un engagement `proposed`, avec la date notée ou une autre ;
 *  - annuler : qui l'a noté, ou le personnel ; `reason` `by_author` ou `by_staff` ;
 *  - un geste qui ne va pas avec l'état : 422 `commitment.invalid_state` ; le super-admin : 403.
 *  - chaque événement désigne l'ENGAGEMENT (AC3), et son `data` ne porte que des codes.
 */
class CycleDeLEngagementTest extends TestCase
{
    use MaintenanceActors, OperateursPlateforme, RefreshDatabase, SceneDEngagement;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
    }

    private function dernierEvenement(): Message
    {
        return Message::query()->where('conversation_id', $this->fil->id)->where('type', MessageType::Event->value)->latest('id')->firstOrFail();
    }

    public function test_le_porteur_confirme_avec_la_date_notee(): void
    {
        $engagement = $this->engagement();
        Sanctum::actingAs($this->locataire);

        $this->postJson("/api/commitments/{$engagement->id}/confirm")
            ->assertOk()->assertJsonPath('data.status', 'open')->assertJsonPath('data.abilities.confirm', false);

        $engagement->refresh();
        $this->assertSame(CommitmentStatus::Open, $engagement->status);
        $this->assertNotNull($engagement->confirmed_at);

        $evenement = $this->dernierEvenement();
        $this->assertSame('commitment.confirmed', $evenement->metadata['code']);
        $this->assertEquals(['type' => 'commitment', 'id' => $engagement->id], $evenement->metadata['object']);
        $this->assertSame([], $evenement->metadata['data']);
    }

    public function test_le_porteur_confirme_avec_une_autre_date(): void
    {
        $engagement = $this->engagement();
        $autre = now()->addDays(5)->startOfMinute()->utc();
        Sanctum::actingAs($this->locataire);

        $this->postJson("/api/commitments/{$engagement->id}/confirm", ['due_at' => $autre->format('Y-m-d\TH:i:s\Z')])
            ->assertOk()->assertJsonPath('data.due_at', $autre->toIso8601String());
        $this->assertTrue($autre->equalTo($engagement->refresh()->due_at));

        // L'événement ne porte pas la date : elle se relit par la projection.
        $this->assertSame([], $this->dernierEvenement()->metadata['data']);
    }

    public function test_une_autre_date_passee_est_refusee(): void
    {
        $engagement = $this->engagement();
        Sanctum::actingAs($this->locataire);

        $this->postJson("/api/commitments/{$engagement->id}/confirm", ['due_at' => now()->subDay()->utc()->format('Y-m-d\TH:i:s\Z')])
            ->assertStatus(422)->assertJsonPath('code', 'commitment.due_in_past');
        $this->assertSame(CommitmentStatus::Proposed, $engagement->refresh()->status);
    }

    public function test_seul_le_porteur_confirme(): void
    {
        $engagement = $this->engagement();

        foreach ([$this->agent, $this->voisin, $this->etranger] as $autre) {
            Sanctum::actingAs($autre);
            $this->postJson("/api/commitments/{$engagement->id}/confirm")->assertForbidden();
        }
        $this->assertSame(CommitmentStatus::Proposed, $engagement->refresh()->status);
    }

    public function test_confirmer_un_engagement_deja_ouvert_est_un_etat_invalide(): void
    {
        $engagement = $this->engagement(['status' => CommitmentStatus::Open]);
        Sanctum::actingAs($this->locataire);

        $this->postJson("/api/commitments/{$engagement->id}/confirm")
            ->assertStatus(422)->assertJsonPath('code', 'commitment.invalid_state');
    }

    public function test_l_auteur_annule_par_by_author_et_le_personnel_par_by_staff(): void
    {
        $sien = $this->engagement(['created_by_id' => $this->locataire->id, 'status' => CommitmentStatus::Open]);
        Sanctum::actingAs($this->locataire);
        $this->postJson("/api/commitments/{$sien->id}/cancel")->assertOk()->assertJsonPath('data.etat', 'cancelled');
        $this->assertSame(['reason' => 'by_author'], $this->dernierEvenement()->metadata['data']);
        $this->assertSame('by_author', $sien->refresh()->cancel_reason);
        $this->assertSame($this->locataire->id, $sien->cancelled_by_id);

        $autre = $this->engagement(['created_by_id' => $this->locataire->id, 'status' => CommitmentStatus::Open]);
        Sanctum::actingAs($this->agent);
        $this->postJson("/api/commitments/{$autre->id}/cancel")->assertOk();
        $evenement = $this->dernierEvenement();
        $this->assertSame('commitment.cancelled', $evenement->metadata['code']);
        $this->assertSame(['reason' => 'by_staff'], $evenement->metadata['data']);
        $this->assertEquals(['type' => 'commitment', 'id' => $autre->id], $evenement->metadata['object']);
    }

    public function test_un_participant_qui_ne_l_a_pas_note_n_annule_pas(): void
    {
        $engagement = $this->engagement(['status' => CommitmentStatus::Open]);

        foreach ([$this->voisin, $this->locataire, $this->etranger] as $autre) {
            Sanctum::actingAs($autre);
            $this->postJson("/api/commitments/{$engagement->id}/cancel")->assertForbidden();
        }
    }

    public function test_annuler_un_engagement_clos_est_un_etat_invalide(): void
    {
        $engagement = $this->engagement(['status' => CommitmentStatus::Kept, 'kept_at' => now()]);
        Sanctum::actingAs($this->agent);

        $this->postJson("/api/commitments/{$engagement->id}/cancel")
            ->assertStatus(422)->assertJsonPath('code', 'commitment.invalid_state');
        $this->assertSame(CommitmentStatus::Kept, $engagement->refresh()->status);
    }

    public function test_le_super_admin_ne_fait_aucun_geste(): void
    {
        $engagement = $this->engagement();
        $superAdmin = $this->operateur(PlatformProfileLevel::SuperAdmin)->fresh();
        $this->assertTrue($superAdmin->isSuperAdmin());
        Sanctum::actingAs($superAdmin);

        $this->postJson("/api/commitments/{$engagement->id}/confirm")->assertForbidden();
        $this->postJson("/api/commitments/{$engagement->id}/cancel")->assertForbidden();
        $this->assertSame(CommitmentStatus::Proposed, $engagement->refresh()->status);
    }

    public function test_un_engagement_ouvert_echu_est_en_retard_a_la_lecture(): void
    {
        $engagement = $this->engagement(['status' => CommitmentStatus::Open]);
        Carbon::setTestNow(now()->addDays(4));
        $this->assertSame(Commitment::ETAT_EN_RETARD, $engagement->refresh()->etat());
        Carbon::setTestNow();
    }
}
