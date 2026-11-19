<?php

namespace Tests\Feature\Messaging\Boite;

use App\Http\Controllers\Api\ConversationPilotageController;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\SignalTempsReel;
use App\Support\TempsReel\TempsReel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\SceneDeNoteDEquipe;
use Tests\Support\SessionsDImpersonation;

/**
 * TCK-2967 (ADR-0128 § 7, AC6) — les trois gestes de la boîte ({@see ConversationPilotageController}) :
 * droits (participant actif seulement), bornes du rappel, attribution réservée aux salles et aux groupes,
 * par et à du personnel actif participant, refus sous impersonation, et signaux `boite.updated` vers le
 * seul lecteur ou le seul personnel participant — jamais sur le canal du sujet.
 */
class GestesDeLaBoiteTest extends ApiTestCase
{
    use RefreshDatabase, SceneDeNoteDEquipe, SessionsDImpersonation;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-18 10:00:00');
        $this->monterLaScene();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function ligneDe(User $user): ConversationParticipant
    {
        return ConversationParticipant::query()->where('conversation_id', $this->fil->id)->where('user_id', $user->id)->firstOrFail();
    }

    private function url(string $geste, ?Conversation $fil = null): string
    {
        return '/api/conversations/'.($fil ?? $this->fil)->id.'/'.$geste;
    }

    // ── « Rappelez-le-moi » ─────────────────────────────────────────────────────────────

    public function test_le_rappel_se_pose_et_se_leve_sur_la_seule_ligne_du_lecteur(): void
    {
        Sanctum::actingAs($this->auteur);
        $this->putJson($this->url('snooze'), ['until' => '2026-11-19T08:00:00+00:00'])
            ->assertOk()
            ->assertJsonPath('data.snoozed_until', '2026-11-19T08:00:00+00:00');

        $this->assertSame('2026-11-19 08:00:00', $this->ligneDe($this->auteur)->snoozed_until?->format('Y-m-d H:i:s'));
        $this->assertNull($this->ligneDe($this->collegue)->snoozed_until);

        $this->deleteJson($this->url('snooze'))->assertOk()->assertJsonPath('data.snoozed_until', null);
        $this->assertNull($this->ligneDe($this->auteur)->snoozed_until);
    }

    public function test_les_bornes_du_rappel(): void
    {
        Sanctum::actingAs($this->auteur);
        $this->putJson($this->url('snooze'), [])->assertUnprocessable()->assertJsonValidationErrors('until');
        $this->putJson($this->url('snooze'), ['until' => '2026-11-18T09:59:00+00:00'])->assertUnprocessable()->assertJsonValidationErrors('until');
        $this->putJson($this->url('snooze'), ['until' => 'demain'])->assertUnprocessable()->assertJsonValidationErrors('until');
        $this->putJson($this->url('snooze'), ['until' => '2026-12-18T10:00:01+00:00'])->assertUnprocessable()->assertJsonValidationErrors('until');
        $this->assertNull($this->ligneDe($this->auteur)->snoozed_until);

        // 30 jours exactement : accepté.
        $this->putJson($this->url('snooze'), ['until' => '2026-12-18T10:00:00+00:00'])->assertOk();
    }

    // ── « Traité » ──────────────────────────────────────────────────────────────────────

    public function test_traite_se_pose_et_s_annule(): void
    {
        Sanctum::actingAs($this->locataire);
        $this->putJson($this->url('handled'))->assertOk()->assertJsonPath('data.handled_at', '2026-11-18T10:00:00+00:00');
        $this->assertSame('2026-11-18 10:00:00', $this->ligneDe($this->locataire)->handled_at?->format('Y-m-d H:i:s'));
        $this->assertNull($this->ligneDe($this->auteur)->handled_at);

        $this->deleteJson($this->url('handled'))->assertOk()->assertJsonPath('data.handled_at', null);
        $this->assertNull($this->ligneDe($this->locataire)->handled_at);
    }

    // ── Droits ──────────────────────────────────────────────────────────────────────────

    /** Un tiers, un ancien membre, un super-admin non participant : 403 sur les cinq routes, rien d'écrit. */
    public function test_seul_un_participant_actif_fait_un_geste(): void
    {
        $tiers = User::factory()->create();
        $ancien = User::factory()->create();
        $this->fil->participants()->attach($ancien->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now(), 'left_at' => now()]);
        $superAdmin = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $this->assertTrue($superAdmin->fresh()->isSuperAdmin());

        foreach ([$tiers, $ancien, $superAdmin->fresh()] as $intrus) {
            Sanctum::actingAs($intrus);
            $this->putJson($this->url('snooze'), ['until' => '2026-11-19T08:00:00+00:00'])->assertForbidden();
            $this->deleteJson($this->url('snooze'))->assertForbidden();
            $this->putJson($this->url('handled'))->assertForbidden();
            $this->deleteJson($this->url('handled'))->assertForbidden();
            $this->putJson($this->url('assignee'), ['user_id' => $this->collegue->id])->assertForbidden();
        }

        // 403 AVANT la validation : un corps mal formé ne renseigne pas un intrus.
        Sanctum::actingAs($tiers);
        $this->putJson($this->url('snooze'), ['until' => 'demain'])->assertForbidden();

        $this->assertNull($this->fil->fresh()->assigned_to_id);
        $this->assertSame(0, ConversationParticipant::query()->where('conversation_id', $this->fil->id)
            ->where(fn ($q) => $q->whereNotNull('snoozed_until')->orWhereNotNull('handled_at'))->count());
    }

    /** AC6 — sous impersonation, aucun geste : 403 `impersonation.read_only`, rien d'écrit. */
    public function test_aucun_geste_sous_impersonation(): void
    {
        ['jeton' => $jeton] = $this->ouvrirUneSession(cible: $this->auteur);

        foreach ([
            ['put', 'snooze', ['until' => '2026-11-19T08:00:00+00:00']],
            ['delete', 'snooze', []],
            ['put', 'handled', []],
            ['delete', 'handled', []],
            ['put', 'assignee', ['user_id' => $this->collegue->id]],
        ] as [$verbe, $geste, $corps]) {
            $this->avecLeJeton($jeton)->json(strtoupper($verbe), $this->url($geste), $corps)
                ->assertForbidden()
                ->assertJsonPath('code', 'impersonation.read_only');
        }

        $this->assertNull($this->ligneDe($this->auteur)->snoozed_until);
        $this->assertNull($this->ligneDe($this->auteur)->handled_at);
        $this->assertNull($this->fil->fresh()->assigned_to_id);
    }

    // ── Confier le fil ──────────────────────────────────────────────────────────────────

    public function test_confier_un_groupe_a_un_collegue_puis_le_reprendre(): void
    {
        Sanctum::actingAs($this->auteur);
        $this->putJson($this->url('assignee'), ['user_id' => $this->collegue->id])
            ->assertOk()
            ->assertJsonPath('data.assigned_to', ['id' => $this->collegue->id, 'name' => $this->collegue->nameWithoutContact()]);
        $this->assertSame($this->collegue->id, $this->fil->fresh()->assigned_to_id);

        // À soi-même, puis personne.
        $this->putJson($this->url('assignee'), ['user_id' => $this->auteur->id])->assertOk();
        $this->assertSame($this->auteur->id, $this->fil->fresh()->assigned_to_id);
        $this->putJson($this->url('assignee'), ['user_id' => null])->assertOk()->assertJsonPath('data.assigned_to', null);
        $this->assertNull($this->fil->fresh()->assigned_to_id);

        $this->putJson($this->url('assignee'), [])->assertUnprocessable()->assertJsonValidationErrors('user_id');
    }

    /** AC6 — la personne confiée : personnel actif de l'agence du fil ET participante active. */
    public function test_confier_a_qui_n_est_pas_personnel_participant_est_refuse(): void
    {
        $collegueHorsDuFil = $this->agentDeLAgence($this->agence);
        $ancien = $this->agentDeLAgence($this->agence);
        $this->fil->participants()->attach($ancien->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now(), 'left_at' => now()]);

        Sanctum::actingAs($this->auteur);
        foreach ([$this->locataire, $this->bailleur, $this->agentAilleurs, $collegueHorsDuFil, $ancien] as $cible) {
            $this->putJson($this->url('assignee'), ['user_id' => $cible->id])
                ->assertUnprocessable()
                ->assertJsonPath('code', 'messaging.assignee_not_staff');
        }
        $this->putJson($this->url('assignee'), ['user_id' => 999999999])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'messaging.assignee_not_staff');

        $this->assertNull($this->fil->fresh()->assigned_to_id);
    }

    /** AC6 — l'auteur aussi est personnel actif de l'agence du fil. */
    public function test_seul_le_personnel_confie(): void
    {
        foreach ([$this->locataire, $this->bailleur, $this->agentAilleurs] as $auteur) {
            Sanctum::actingAs($auteur);
            $this->putJson($this->url('assignee'), ['user_id' => $this->collegue->id])
                ->assertUnprocessable()
                ->assertJsonPath('code', 'messaging.assignee_author_not_staff');
        }

        $this->assertNull($this->fil->fresh()->assigned_to_id);
    }

    /** AC6 — le fil d'un prospect (ADR-0068) et toute directe ne se confient pas. */
    public function test_le_fil_d_un_prospect_ne_se_confie_pas(): void
    {
        $prospect = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'property_id' => $this->bien->id,
            'created_by' => $this->auteur->id,
        ]);
        $directe = Conversation::create([
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'created_by' => $this->auteur->id,
        ]);
        foreach ([$prospect, $directe] as $fil) {
            foreach ([$this->auteur, $this->collegue] as $membre) {
                $fil->participants()->attach($membre->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
            }

            Sanctum::actingAs($this->auteur);
            $this->putJson($this->url('assignee', $fil), ['user_id' => $this->collegue->id])
                ->assertUnprocessable()
                ->assertJsonPath('code', 'messaging.assignee_thread_type');
            $this->assertNull($fil->fresh()->assigned_to_id);
        }
    }

    // ── Temps réel ──────────────────────────────────────────────────────────────────────

    /** « Rappelez-le-moi » et « Traité » : `boite.updated` au seul lecteur, rien sur le canal du sujet. */
    public function test_rappel_et_traite_signalent_au_seul_lecteur(): void
    {
        foreach ([
            ['PUT', 'snooze', ['until' => '2026-11-19T08:00:00+00:00']],
            ['DELETE', 'snooze', []],
            ['PUT', 'handled', []],
            ['DELETE', 'handled', []],
        ] as [$verbe, $geste, $corps]) {
            $faux = TempsReel::fake();
            Sanctum::actingAs($this->collegue);
            $this->json($verbe, $this->url($geste), $corps)->assertOk();

            $this->assertSame(
                [['canaux' => ['utilisateur.'.$this->collegue->id], 'sujet' => 'conversation:'.$this->fil->id, 'code' => CodeDeSignal::BoiteUpdated]],
                $this->envois($faux->envois()),
                "{$verbe} {$geste}",
            );
        }
    }

    /** Confier : `boite.updated` au personnel participant (l'équipe), à personne d'autre. */
    public function test_confier_signale_au_personnel_participant(): void
    {
        $faux = TempsReel::fake();
        Sanctum::actingAs($this->auteur);
        $this->putJson($this->url('assignee'), ['user_id' => $this->collegue->id])->assertOk();

        $equipe = ['utilisateur.'.min($this->auteur->id, $this->collegue->id), 'utilisateur.'.max($this->auteur->id, $this->collegue->id)];
        $this->assertSame(
            [['canaux' => $equipe, 'sujet' => 'conversation:'.$this->fil->id, 'code' => CodeDeSignal::BoiteUpdated]],
            $this->envois($faux->envois()),
        );
    }

    /**
     * @param  list<SignalTempsReel>  $envois
     * @return list<array{canaux: list<string>, sujet: string, code: CodeDeSignal}>
     */
    private function envois(array $envois): array
    {
        return array_map(function (SignalTempsReel $s): array {
            $canaux = $s->canaux;
            sort($canaux);

            return ['canaux' => $canaux, 'sujet' => $s->sujet, 'code' => $s->code];
        }, $envois);
    }
}
