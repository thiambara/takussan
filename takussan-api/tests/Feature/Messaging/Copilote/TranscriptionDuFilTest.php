<?php

namespace Tests\Feature\Messaging\Copilote;

use App\Ai\Usages\FilTranscriptionUsage;
use App\Models\AiCall;
use App\Models\AiSuggestion;
use App\Models\Enums\AiCallOutcome;
use App\Models\Enums\AiRefusalReason;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Models\Message;
use App\Services\Ai\AiGateway;
use App\Services\Messaging\Copilote\LectureDuFilPourIa;
use App\Support\TempsReel\CanauxTempsReel;
use App\Support\TempsReel\CodeDeSignal;
use App\Support\TempsReel\FauxTransport;
use App\Support\TempsReel\TempsReel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Ai\Transcription;
use Laravel\Sanctum\Sanctum;
use Tests\Support\SceneDuCopilote;
use Tests\TestCase;

/**
 * TCK-2976 (ADR-0131 § 7) — la transcription d'une note vocale : rôle vide sans appel ni job, une seule transcription
 * par message, la clé `transcription` au seul personnel servi, chargée en lot, le signal aux seuls lecteurs des notes.
 * Faux du SDK seulement : aucune clé réelle.
 */
class TranscriptionDuFilTest extends TestCase
{
    use RefreshDatabase, SceneDuCopilote;

    private FauxTransport $transport;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
        Storage::fake('private');
        $this->monterLaScene();
        $this->installerLeCopilote();
        $this->transport = TempsReel::fake();
        Transcription::fake(['Bonjour, je passe demain à dix heures.']);
    }

    private function affecterLeRole(): void
    {
        config([
            'ai.providers.openai.key' => 'cle-de-test',
            'ai.roles.transcription' => [['provider' => 'openai', 'model' => 'modele-t']],
        ]);
    }

    private function noteVocale(): Message
    {
        $m = Message::query()->create([
            'conversation_id' => $this->fil->id,
            'sender_id' => $this->locataire->id,
            'content' => 'Note vocale',
            'type' => MessageType::Audio->value,
            'visibility' => MessageVisibility::All->value,
            'metadata' => ['duration' => 12],
        ]);
        $m->addMedia(UploadedFile::fake()->create('note.webm', 40, 'audio/webm'))->toMediaCollection('attachments');

        return $m;
    }

    private function transcrire($lecteur, Message $note): TestResponse
    {
        Sanctum::actingAs($lecteur);

        return $this->postJson('/api/conversations/'.$this->fil->id.'/messages/'.$note->id.'/transcription');
    }

    /** @return array<string, mixed>|null */
    private function transcriptionLuePar($lecteur, Message $note): ?array
    {
        Sanctum::actingAs($lecteur);
        $data = $this->getJson('/api/conversations/'.$this->fil->id.'/messages')->assertOk()->json('data');
        foreach ($data as $m) {
            if ((int) $m['id'] === (int) $note->id) {
                return array_key_exists('transcription', $m) ? ['valeur' => $m['transcription']] : null;
            }
        }
        $this->fail('note absente de la page');
    }

    public function test_ac1_role_vide_indisponible_sans_job_ni_appel_puis_le_role_affecte_la_note_se_transcrit(): void
    {
        $note = $this->noteVocale();

        $this->transcrire($this->auteur, $note)->assertOk()
            ->assertJsonPath('data.etat', 'indisponible')->assertJsonPath('data.code', 'ai.role_unassigned');
        $this->assertSame(0, AiCall::query()->count());
        Transcription::assertNothingGenerated();
        $this->assertSame(['etat' => 'indisponible', 'code' => 'ai.role_unassigned'], $this->transcriptionLuePar($this->auteur, $note)['valeur']);

        // Un refus de budget de la veille ne se lit plus.
        $this->travelTo(now()->subDay());
        AiCall::query()->create(['usage_key' => FilTranscriptionUsage::KEY, 'role' => 'transcription', 'prompt_version' => 1, 'outcome' => AiCallOutcome::Refused, 'refusal_reason' => AiRefusalReason::Budget, 'subject_type' => $note->getMorphClass(), 'subject_id' => $note->id, 'actor_id' => $this->auteur->id]);
        $this->travelBack();

        $this->affecterLeRole();
        $this->assertSame(['etat' => 'aucune'], $this->transcriptionLuePar($this->auteur, $note)['valeur']);
        $this->transcrire($this->auteur, $note)->assertStatus(202);
        $this->assertSame('prete', $this->transcriptionLuePar($this->auteur, $note)['valeur']['etat']);
    }

    public function test_ac2_le_locataire_ne_recoit_pas_la_cle_et_l_agent_la_recoit(): void
    {
        $note = $this->noteVocale();

        $this->assertNull($this->transcriptionLuePar($this->locataire, $note));
        $this->assertNull($this->transcriptionLuePar($this->bailleur, $note));
        $this->assertNotNull($this->transcriptionLuePar($this->auteur, $note));
    }

    public function test_un_non_personnel_recoit_404_et_rien_ne_part(): void
    {
        $this->affecterLeRole();
        $note = $this->noteVocale();

        $this->transcrire($this->locataire, $note)->assertNotFound();
        $this->transcrire($this->bailleur, $note)->assertNotFound();
        $this->assertSame(0, AiCall::query()->count());
        Transcription::assertNothingGenerated();
    }

    public function test_un_message_texte_ou_d_un_autre_fil_rend_404(): void
    {
        $this->affecterLeRole();
        $texte = $this->ecrireDesMessages(1, $this->locataire);
        $this->transcrire($this->auteur, $texte)->assertNotFound();

        $autre = $this->groupe([$this->auteur, $this->locataire], ['property_id' => $this->bien->id]);
        $ailleurs = $this->noteVocale();
        $ailleurs->forceFill(['conversation_id' => $autre->id])->save();
        $this->transcrire($this->auteur, $ailleurs)->assertNotFound();
        $this->assertSame(0, AiCall::query()->count());
    }

    public function test_ac3_transcrite_une_fois_texte_au_personnel_langue_fr_agence_du_fil_signal_aux_lecteurs_des_notes(): void
    {
        $this->affecterLeRole();
        $note = $this->noteVocale();

        $this->transcrire($this->auteur, $note)->assertStatus(202);
        $this->transcrire($this->auteur, $note)->assertOk()->assertJsonPath('data.etat', 'prete');
        $this->transcrire($this->collegue, $note)->assertOk()->assertJsonPath('data.etat', 'prete');

        $this->assertSame(1, AiCall::query()->where('outcome', AiCallOutcome::Success)->count());
        $this->assertSame(1, AiSuggestion::query()->where('usage_key', FilTranscriptionUsage::KEY)->count());
        $appel = AiCall::query()->sole();
        $this->assertSame((int) $this->agence->id, (int) $appel->agency_id);
        Transcription::assertGenerated(fn ($prompt) => $prompt->language === AiGateway::TRANSCRIPTION_LANGUAGE);

        $lue = $this->transcriptionLuePar($this->auteur, $note)['valeur'];
        $this->assertSame(['etat' => 'prete', 'texte' => 'Bonjour, je passe demain à dix heures.', 'langue' => 'fr'], $lue);

        // Le signal : sur le canal d'utilisateur des seuls lecteurs des notes, jamais sur celui du locataire.
        TempsReel::assertSignale(CodeDeSignal::MessageUpdated, CanauxTempsReel::canalDe($this->auteur->id));
        $canaux = collect($this->transport->signaux ?? [])->flatMap(fn ($s) => (array) ($s->canaux ?? []))->all();
        $this->assertNotContains(CanauxTempsReel::canalDe($this->locataire->id), $canaux);
    }

    public function test_la_transcription_entre_dans_la_lecture_du_fil_masquee(): void
    {
        $this->affecterLeRole();
        Transcription::fake(['Rappelez-moi au 77 123 45 67, merci.']);
        $note = $this->noteVocale();
        $this->transcrire($this->auteur, $note)->assertStatus(202);

        $requete = Request::create('/');
        $requete->setUserResolver(fn () => $this->auteur);
        $entree = app(LectureDuFilPourIa::class)->lire($this->auteur, $this->fil, $requete, (int) $note->id, (int) $note->id)['texte'];

        $this->assertStringContainsString('Rappelez-moi au', $entree);
        $this->assertStringNotContainsString('77 123 45 67', $entree);
    }

    public function test_agence_qui_coupe_la_fonction_rend_copilote_coupe_sans_job(): void
    {
        $this->affecterLeRole();
        config(['ai.copilote.fonctions.transcription' => false]);
        $note = $this->noteVocale();

        $this->transcrire($this->auteur, $note)->assertOk()
            ->assertJsonPath('data.etat', 'indisponible')->assertJsonPath('data.code', 'copilote.coupe');
        $this->assertSame(0, AiCall::query()->count());
        Transcription::assertNothingGenerated();
    }

    public function test_ac4_requetes_de_la_page_constantes_de_1_a_20_notes(): void
    {
        $this->affecterLeRole();
        $this->noteVocale();
        Sanctum::actingAs($this->auteur);
        $this->getJson('/api/conversations/'.$this->fil->id.'/messages')->assertOk();

        $compter = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/conversations/'.$this->fil->id.'/messages')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };
        $une = $compter();
        for ($i = 0; $i < 19; $i++) {
            $this->noteVocale();
        }
        $this->assertSame($une, $compter());
    }
}
