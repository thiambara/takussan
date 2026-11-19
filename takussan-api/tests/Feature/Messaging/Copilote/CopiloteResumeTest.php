<?php

namespace Tests\Feature\Messaging\Copilote;

use App\Ai\Agents\FilResume;
use App\Jobs\Copilote\DemanderAuCopilote;
use App\Models\Agency;
use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\AiUsageSetting;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiRefusalReason;
use App\Models\Message;
use App\Models\Profiles\AgentProfile;
use App\Services\Ai\AiGateway;
use App\Services\Ai\SuggestionRecorder;
use App\Services\Messaging\Copilote\GardeDuCopilote;
use App\Services\Messaging\Copilote\LectureDuFilPourIa;
use App\Support\TempsReel\CanauxTempsReel;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\FauxTransport;
use App\Support\TempsReel\SignalTempsReel;
use App\Support\TempsReel\TempsReel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\SceneDuCopilote;
use Tests\TestCase;

/**
 * TCK-2974 (ADR-0131 § 3, AC4, AC5) — le résumé : fenêtre et seuil jugés sans appel, idempotence par fenêtre,
 * `202` puis `prete`, le signal au seul demandeur, l'état dérivé du journal (budget, coupe-circuit, échec),
 * qui ne vaut que le jour même, et le résumé d'un agent que nul autre ne lit.
 */
class CopiloteResumeTest extends TestCase
{
    use RefreshDatabase, SceneDuCopilote;

    private FauxTransport $transport;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
        $this->installerLeCopilote();
        $this->transport = TempsReel::fake();
    }

    public function test_ac4_une_fenetre_sous_le_seuil_rend_422_sans_appel(): void
    {
        // Neuf messages du locataire, et ceux de l'agent lui-même ne comptent pas.
        $depuis = $this->ecrireDesMessages(9, $this->locataire)->id;
        $this->ecrireDesMessages(5, $this->auteur);

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(422)->assertJsonPath('code', 'copilote.resume_inutile');
        $this->assertSame(0, AiCall::query()->count());
        FilResume::assertNeverPrompted();
    }

    public function test_ac4_un_message_d_un_autre_fil_rend_422_sans_appel(): void
    {
        $autre = $this->groupe([$this->auteur, $this->locataire], ['property_id' => $this->bien->id]);
        $ailleurs = $this->ecrireDesMessages(12, $this->locataire, $autre)->id;
        $this->ecrireDesMessages(12, $this->locataire);

        $this->demanderUnResume($this->auteur, $ailleurs)->assertStatus(422)->assertJsonPath('code', 'copilote.resume_inutile');
        $this->assertSame(0, AiCall::query()->count());
    }

    public function test_ac4_le_fil_marque_lu_avant_la_demande_se_resume_quand_meme(): void
    {
        $depuis = $this->ecrireDesMessages(12, $this->locataire)->id;
        Sanctum::actingAs($this->auteur);
        $this->putJson('/api/conversations/'.$this->fil->id.'/read')->assertSuccessful();

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);
        $this->etatDuCopilote($this->auteur)->assertOk()->assertJsonPath('data.sortes.resume.statut', 'prete');
    }

    public function test_ac4_un_second_post_sur_la_meme_fenetre_ne_fait_pas_de_second_appel(): void
    {
        $depuis = $this->ecrireDesMessages(12, $this->locataire)->id;

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);
        $id = $this->demanderUnResume($this->auteur, $depuis)->assertOk()
            ->assertJsonPath('data.statut', 'prete')->json('data.suggestion_id');

        $this->assertSame(1, AiCall::query()->count());
        $this->assertSame(1, AiSuggestion::query()->count());
        $this->assertSame((int) AiSuggestion::query()->value('id'), $id);
    }

    public function test_ac5_202_puis_prete_et_le_signal_au_seul_demandeur(): void
    {
        $depuis = $this->ecrireDesMessages(12, $this->locataire)->id;
        $avant = count($this->signauxDuCopilote());

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);

        $signaux = array_slice($this->signauxDuCopilote(), $avant);
        $this->assertCount(1, $signaux);
        $this->assertSame([CanauxTempsReel::canalDe($this->auteur->id)], $signaux[0]->canaux);

        $etat = $this->etatDuCopilote($this->auteur)->assertOk()->json('data.sortes.resume');
        $this->assertSame('prete', $etat['statut']);
        $this->assertSame($depuis, $etat['proposition']['depuis_message_id']);
        $this->assertSame((int) Message::query()->max('id'), $etat['proposition']['jusqu_a_message_id']);
        $this->assertTrue($etat['proposition']['points'][0]['attend_le_lecteur']);
        // Rien ne s'écrit dans le fil.
        $this->assertSame(12, Message::query()->where('conversation_id', $this->fil->id)->count());
    }

    public function test_un_message_id_invente_est_retire(): void
    {
        $depuis = $this->ecrireDesMessages(12, $this->locataire)->id;
        $this->sortieDuModele = ['points' => [
            ['texte' => 'Inventé.', 'message_id' => 999999999, 'attend_le_lecteur' => true],
            ['texte' => 'Réel.', 'message_id' => $depuis, 'attend_le_lecteur' => false],
        ]];

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);

        $points = AiSuggestion::query()->firstOrFail()->proposal['points'];
        $this->assertSame([['texte' => 'Réel.', 'message_id' => $depuis, 'attend_le_lecteur' => false]], $points);
    }

    public function test_ac5_budget_epuise_puis_aucun_le_lendemain_et_une_nouvelle_demande_repart(): void
    {
        $depuis = $this->ecrireDesMessages(12, $this->locataire)->id;
        AiUsageSetting::query()->create(['usage_key' => 'fil.resume', 'enabled' => true, 'daily_budget_usd' => '0.00']);

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);
        $this->etatDuCopilote($this->auteur)->assertJsonPath('data.sortes.resume.statut', 'refusee')
            ->assertJsonPath('data.sortes.resume.code', 'copilote.budget_epuise');
        $this->assertSame(AiRefusalReason::Budget, AiCall::query()->latest('id')->first()->refusal_reason);

        $this->travelTo(now()->addDay()->startOfDay()->addHours(8));
        $this->etatDuCopilote($this->auteur)->assertJsonPath('data.sortes.resume.statut', 'aucun');

        AiUsageSetting::query()->where('usage_key', 'fil.resume')->update(['daily_budget_usd' => null]);
        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);
        $this->etatDuCopilote($this->auteur)->assertJsonPath('data.sortes.resume.statut', 'prete');
    }

    public function test_ac5_le_coupe_circuit_de_la_passerelle_rend_coupe(): void
    {
        $depuis = $this->ecrireDesMessages(12, $this->locataire)->id;
        // La course : la fonction est coupée entre la demande et le job. Le job joue la passerelle, qui refuse.
        AiUsageSetting::query()->create(['usage_key' => 'fil.resume', 'enabled' => false]);
        $this->jouerLeJob($depuis);

        $this->assertSame(AiRefusalReason::KillSwitch, AiCall::query()->latest('id')->first()->refusal_reason);
        $this->etatDuCopilote($this->auteur)->assertJsonPath('data.sortes.resume.statut', 'refusee')
            ->assertJsonPath('data.sortes.resume.code', 'copilote.coupe');
    }

    public function test_copilote_desactive_refuse_par_code_sans_appel_au_modele(): void
    {
        $depuis = $this->ecrireDesMessages(12, $this->locataire)->id;
        config(['ai.copilote.actif' => false]);

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(409)->assertJsonPath('code', 'copilote.coupe');
        $this->etatDuCopilote($this->auteur)->assertOk()
            ->assertJsonPath('data.sortes.resume.statut', 'refusee')
            ->assertJsonPath('data.sortes.resume.code', 'copilote.coupe')
            ->assertJsonPath('data.sortes.resume.portee', 'plateforme');

        $this->assertSame(0, AiCall::query()->count());
        $this->assertSame([], $this->signauxDuCopilote());
        FilResume::assertNeverPrompted();
    }

    public function test_un_echec_du_fournisseur_rend_echec_le_jour_meme(): void
    {
        $depuis = $this->ecrireDesMessages(12, $this->locataire)->id;
        config(['ai.roles.redaction' => []]);

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);

        $this->assertSame(AiCallOutcome::Error, AiCall::query()->latest('id')->first()->outcome);
        $this->etatDuCopilote($this->auteur)->assertJsonPath('data.sortes.resume.statut', 'echec')
            ->assertJsonPath('data.sortes.resume.code', 'copilote.echec');
    }

    public function test_un_collegue_du_meme_fil_ne_lit_pas_le_resume_de_l_autre(): void
    {
        $depuis = $this->ecrireDesMessages(12, $this->locataire)->id;
        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);

        $this->etatDuCopilote($this->collegue)->assertOk()->assertJsonPath('data.sortes.resume.statut', 'aucun');
    }

    public function test_le_job_hors_de_toute_requete_lit_les_notes_du_lecteur_par_son_profil_de_la_demande(): void
    {
        $depuis = $this->ecrireDesMessages(11, $this->locataire)->id;
        $this->ecrireUneNote('NOTE_LUE_PAR_LE_JOB');
        // Un second profil d'agence : sans le profil de la demande, l'auto-bascule ne donnerait aucune agence.
        AgentProfile::query()->create(['user_id' => $this->auteur->id, 'agency_id' => Agency::factory()->create()->id]);
        // Comme `worker-ia` : aucun utilisateur authentifié, aucune requête.
        $this->app['auth']->forgetGuards();
        $this->app->forgetInstance('request');

        $profil = AgentProfile::query()->where('user_id', $this->auteur->id)->where('agency_id', $this->agence->id)->firstOrFail();
        (new DemanderAuCopilote($this->auteur->id, $this->fil->id, 'resume',
            ['depuis_message_id' => $depuis, 'jusqu_a_message_id' => (int) Message::query()->max('id')],
            $profil->getMorphClass(), (int) $profil->id,
        ))->handle(app(AiGateway::class), app(SuggestionRecorder::class), app(GardeDuCopilote::class), app(LectureDuFilPourIa::class));

        $this->assertCount(1, $this->entreesRecues);
        $this->assertStringContainsString('NOTE_LUE_PAR_LE_JOB', $this->entreesRecues[0]);
        // Les projections se résolvent pour le lecteur reconstruit : la référence du bail (le sujet) y est.
        $this->assertStringContainsString((string) $this->bail->reference_number, $this->entreesRecues[0]);
        $this->assertSame(1, AiSuggestion::query()->count());
    }

    private function jouerLeJob(int $depuis): void
    {
        $profil = AgentProfile::query()->where('user_id', $this->auteur->id)->firstOrFail();
        (new DemanderAuCopilote($this->auteur->id, $this->fil->id, 'resume',
            ['depuis_message_id' => $depuis, 'jusqu_a_message_id' => (int) Message::query()->max('id')],
            $profil->getMorphClass(), (int) $profil->id,
        ))->handle(app(AiGateway::class), app(SuggestionRecorder::class), app(GardeDuCopilote::class), app(LectureDuFilPourIa::class));
    }

    /** @return list<SignalTempsReel> */
    private function signauxDuCopilote(): array
    {
        return array_values(array_filter($this->transport->envois(), fn (SignalTempsReel $s) => $s->code === CodeDeSignal::CopiloteUpdated));
    }
}
