<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Commitment;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use App\Services\Messaging\FileDuFil;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2970 (ADR-0130 § 3, AC7) — la question « Tenu ? », horloge figée : posée une heure après l'échéance
 * d'un engagement `open` qui a un bénéficiaire, elle attend le BÉNÉFICIAIRE seul (non lu, file `vous`), une
 * fois par échéance. « Oui, c'est fait » (`kept`) et « Pas encore » (`not_kept_yet`) la clôturent.
 *
 * Scène : le locataire porte la promesse, faite au voisin ; l'agent est le personnel.
 */
class QuestionTenuTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement;

    private Carbon $echeance;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-19 10:00:00');
        $this->monterLaScene();
        $this->echeance = now()->addDays(2);
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
            'due_at' => $this->echeance,
        ]);
    }

    private function passerA(Carbon $instant): void
    {
        Carbon::setTestNow($instant);
        $this->artisan('commitments:signal')->assertSuccessful();
    }

    /** @return list<Message> */
    private function questions(): array
    {
        return Message::query()->where('conversation_id', $this->fil->id)->where('type', MessageType::Event->value)
            ->whereRaw("metadata->>'code' = ?", ['commitment.check_requested'])->orderBy('id')->get()->all();
    }

    /** @return array<string, mixed> la ligne du fil dans la boîte du lecteur */
    private function ligne(User $lecteur): array
    {
        Sanctum::actingAs($lecteur);
        $ligne = collect($this->getJson('/api/conversations')->assertOk()->json('data'))->firstWhere('id', $this->fil->id);
        $this->assertNotNull($ligne, 'Le fil manque à la boîte du lecteur.');

        return $ligne;
    }

    private function geste(Commitment $engagement, User $acteur, string $geste): TestResponse
    {
        Sanctum::actingAs($acteur);

        return $this->postJson("/api/commitments/{$engagement->id}/{$geste}");
    }

    /** AC7 — à l'échéance + 1 h, la question attend le bénéficiaire seul. */
    public function test_a_l_echeance_plus_une_heure_la_question_attend_le_beneficiaire_seul(): void
    {
        $engagement = $this->ouvert();

        $this->passerA($this->echeance->copy()->addMinutes(30));
        $this->assertSame([], $this->questions(), 'Pas avant une heure.');

        $this->passerA($this->echeance->copy()->addHour());
        $questions = $this->questions();
        $this->assertCount(1, $questions);
        $this->assertSame([$this->voisin->id], $questions[0]->metadata['action_for']);
        $this->assertEquals(['type' => 'commitment', 'id' => $engagement->id], $questions[0]->metadata['object']);
        $this->assertNotNull($engagement->refresh()->check_requested_at);

        $ligne = $this->ligne($this->voisin);
        $this->assertSame(FileDuFil::VOUS, $ligne['file']);
        $this->assertGreaterThanOrEqual(1, $ligne['unread_count']);
        $this->assertNotSame(FileDuFil::VOUS, $this->ligne($this->agent)['file'], 'Le personnel n\'est pas attendu par la question.');

        // Le bénéficiaire voit ses deux réponses offertes.
        Sanctum::actingAs($this->voisin);
        $carte = collect($this->getJson("/api/conversations/{$this->fil->id}/commitments")->assertOk()->json('data'))->firstWhere('id', $engagement->id);
        $this->assertTrue($carte['abilities']['keep']);
        $this->assertTrue($carte['abilities']['not_yet']);
    }

    /** AC7 — « Oui, c'est fait » clôt la question. */
    public function test_oui_c_est_fait_clot_la_question(): void
    {
        $engagement = $this->ouvert();
        $this->passerA($this->echeance->copy()->addHour());
        $this->assertSame(FileDuFil::VOUS, $this->ligne($this->voisin)['file']);

        $this->geste($engagement, $this->voisin, 'kept')->assertOk();

        $ligne = $this->ligne($this->voisin);
        $this->assertNotSame(FileDuFil::VOUS, $ligne['file']);
        $this->assertSame(0, $ligne['unread_count']);
    }

    /** AC7 — « Pas encore » clôt la question et laisse l'engagement ouvert ; une seule réponse. */
    public function test_pas_encore_clot_la_question_et_laisse_l_engagement_ouvert(): void
    {
        $engagement = $this->ouvert();
        $this->passerA($this->echeance->copy()->addHour());

        $this->geste($engagement, $this->voisin, 'not-yet')->assertOk()
            ->assertJsonPath('data.status', 'open')->assertJsonPath('data.abilities.not_yet', false);

        $this->assertSame(CommitmentStatus::Open, $engagement->refresh()->status);
        $ligne = $this->ligne($this->voisin);
        $this->assertNotSame(FileDuFil::VOUS, $ligne['file']);
        $this->assertSame(0, $ligne['unread_count']);

        $this->geste($engagement, $this->voisin, 'not-yet')->assertStatus(422)->assertJsonPath('code', 'commitment.invalid_state');

        // La commande ne la repose pas pour la même échéance.
        $this->passerA($this->echeance->copy()->addDays(2));
        $this->assertCount(1, $this->questions());
    }

    /** Tenu, puis rouvert : la question close par « tenu » ne se rouvre pas (une question par échéance). */
    public function test_apres_tenu_puis_rouvert_la_question_reste_close(): void
    {
        $engagement = $this->ouvert();
        $this->passerA($this->echeance->copy()->addHour());
        $this->geste($engagement, $this->locataire, 'kept')->assertOk();
        Sanctum::actingAs($this->voisin);
        $this->postJson("/api/commitments/{$engagement->id}/reopen", ['reason' => 'Toujours pas fait'])->assertOk()
            ->assertJsonPath('data.abilities.not_yet', false);

        $this->geste($engagement, $this->voisin, 'not-yet')->assertStatus(422)->assertJsonPath('code', 'commitment.invalid_state');
        $this->passerA($this->echeance->copy()->addHours(3));
        $this->assertCount(1, $this->questions());
    }

    public function test_pas_encore_sans_question_posee_est_refuse(): void
    {
        $engagement = $this->ouvert();

        $this->geste($engagement, $this->voisin, 'not-yet')->assertStatus(422)->assertJsonPath('code', 'commitment.invalid_state');
    }

    public function test_seul_le_beneficiaire_repond_pas_encore(): void
    {
        $engagement = $this->ouvert();
        $this->passerA($this->echeance->copy()->addHour());

        $this->geste($engagement, $this->locataire, 'not-yet')->assertForbidden();
        $this->geste($engagement, $this->agent, 'not-yet')->assertForbidden();
    }

    public function test_aucune_question_sans_beneficiaire(): void
    {
        $this->ouvert(['beneficiary_id' => null]);

        $this->passerA($this->echeance->copy()->addHours(3));

        $this->assertSame([], $this->questions());
    }

    /** AC7 — une question par échéance, et une nouvelle après un report. */
    public function test_une_question_par_echeance_et_une_nouvelle_apres_un_report(): void
    {
        $engagement = $this->ouvert();
        $this->passerA($this->echeance->copy()->addHour());
        $this->passerA($this->echeance->copy()->addHours(2));
        $this->assertCount(1, $this->questions());

        $nouvelle = now()->addDays(3);
        Sanctum::actingAs($this->locataire);
        $this->putJson("/api/commitments/{$engagement->id}", ['due_at' => $nouvelle->copy()->utc()->format('Y-m-d\TH:i:s\Z')])->assertOk();
        $this->assertNull($engagement->refresh()->check_requested_at);
        $this->assertNotSame(FileDuFil::VOUS, $this->ligne($this->voisin)['file'], 'Le report clôt la question en cours.');

        $this->passerA($nouvelle->copy()->addHour());
        $this->assertCount(2, $this->questions());
    }
}
