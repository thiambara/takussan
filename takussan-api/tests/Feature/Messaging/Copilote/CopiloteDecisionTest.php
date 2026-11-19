<?php

namespace Tests\Feature\Messaging\Copilote;

use App\Models\AiSuggestion;
use App\Models\Commitment;
use App\Models\Message;
use App\Support\TempsReel\TempsReel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\SceneDuCopilote;
use Tests\TestCase;

/**
 * TCK-2975 (ADR-0131 § 3) — `PUT /api/copilote/suggestions/{suggestion}/decision` : le demandeur seul, une seule
 * fois ; un collègue en 404 (AC4) ; une proposition purgée en 410 ; `edited` garde son différentiel ; aucune
 * décision n'écrit un message (AC3).
 */
final class CopiloteDecisionTest extends TestCase
{
    use RefreshDatabase, SceneDuCopilote;

    private AiSuggestion $suggestion;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
        $this->installerLeCopilote();
        $this->installerLesAutresSortes();
        TempsReel::fake();

        $this->ecrireUnMessage('Bonjour', $this->locataire);
        Sanctum::actingAs($this->auteur);
        $this->postJson('/api/conversations/'.$this->fil->id.'/copilote/brouillon', [])->assertStatus(202);
        $this->suggestion = AiSuggestion::query()->where('usage_key', 'fil.brouillon')->firstOrFail();
    }

    public function test_le_demandeur_accepte_une_seule_fois_sans_ecrire_de_message(): void
    {
        $avant = Message::query()->count();
        $engagements = Commitment::query()->count();

        $this->decider($this->auteur, ['decision' => 'accepted'])->assertOk()->assertJsonPath('data.decision', 'accepted');
        $this->decider($this->auteur, ['decision' => 'rejected'])->assertStatus(409)->assertJsonPath('code', 'copilote.deja_decidee');

        $this->assertSame($avant, Message::query()->count());
        $this->assertSame($engagements, Commitment::query()->count());
    }

    public function test_un_collegue_du_meme_fil_ou_un_etranger_recoit_404_et_rien_n_est_decide(): void
    {
        $this->decider($this->collegue, ['decision' => 'accepted'])->assertNotFound();
        $this->decider($this->locataire, ['decision' => 'accepted'])->assertNotFound();
        $this->decider($this->agentAilleurs, ['decision' => 'accepted'])->assertNotFound();

        $this->assertSame('pending', $this->suggestion->fresh()->decision->value);
    }

    public function test_edited_exige_final_et_garde_son_differentiel(): void
    {
        $this->decider($this->auteur, ['decision' => 'edited'])->assertStatus(422);

        $this->decider($this->auteur, ['decision' => 'edited', 'final' => ['texte' => 'Bonjour, à jeudi.']])->assertOk();

        $ligne = $this->suggestion->fresh();
        $this->assertSame('edited', $ligne->decision->value);
        $this->assertSame('Bonjour, à jeudi.', $ligne->final_value['texte']);
        $this->assertNotEmpty($ligne->correction_diff);
    }

    public function test_une_proposition_purgee_ne_se_decide_plus(): void
    {
        $this->suggestion->forceFill(['proposal' => []])->save();

        $this->decider($this->auteur, ['decision' => 'accepted'])->assertStatus(410)->assertJsonPath('code', 'copilote.suggestion_purgee');
    }

    public function test_une_suggestion_hors_du_copilote_est_introuvable(): void
    {
        $this->suggestion->forceFill(['usage_key' => 'radar.extraction'])->save();

        $this->decider($this->auteur, ['decision' => 'accepted'])->assertNotFound();
    }

    /** @param  array<string, mixed>  $corps */
    private function decider($lecteur, array $corps): TestResponse
    {
        Sanctum::actingAs($lecteur);

        return $this->putJson('/api/copilote/suggestions/'.$this->suggestion->id.'/decision', $corps);
    }
}
