<?php

namespace Tests\Feature\Messaging\Copilote;

use App\Models\AiSuggestion;
use App\Models\Commitment;
use App\Models\Conversation;
use App\Models\Message;
use App\Support\TempsReel\TempsReel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\SceneDuCopilote;
use Tests\TestCase;

/**
 * TCK-2975 (ADR-0131 §§ 2, 3) — « Demander au fil » et le brouillon d'une réponse, sur le faux modèle du SDK.
 * AC1 : une note d'équipe n'entre JAMAIS dans l'entrée d'un brouillon, et entre dans celle d'une question.
 * AC2 : une source ou un appui hors du fil est retiré avant écriture. AC3 : aucun message créé.
 */
final class CopiloteBrouillonQuestionTest extends TestCase
{
    use RefreshDatabase, SceneDuCopilote;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
        $this->installerLeCopilote();
        $this->installerLesAutresSortes();
        TempsReel::fake();
    }

    public function test_ac1_le_brouillon_ne_lit_jamais_une_note_d_equipe_la_question_si(): void
    {
        $this->ecrireUnMessage('Le plombier passe quand ?', $this->locataire);
        $this->ecrireUneNote('NOTE_SECRETE_DE_L_EQUIPE');
        $this->ecrireUnMessage('MESSAGE_PUBLIC_RECENT', $this->locataire);

        $this->demander('brouillon', [])->assertStatus(202);
        $this->assertCount(1, $this->entreesRecues);
        $this->assertStringContainsString('MESSAGE_PUBLIC_RECENT', $this->entreesRecues[0]);
        $this->assertStringNotContainsString('NOTE_SECRETE_DE_L_EQUIPE', $this->entreesRecues[0]);

        $this->demander('question', ['question' => 'Le plombier a-t-il confirmé ?'])->assertStatus(202);
        $this->assertCount(2, $this->entreesRecues);
        $this->assertStringContainsString('NOTE_SECRETE_DE_L_EQUIPE', $this->entreesRecues[1]);
        $this->assertStringContainsString('Le plombier a-t-il confirmé ?', $this->entreesRecues[1]);
    }

    public function test_ac2_une_source_hors_du_fil_ou_un_objet_illisible_est_retire_avant_ecriture(): void
    {
        $ici = $this->ecrireUnMessage('Il a confirmé jeudi.', $this->locataire);
        $ailleurs = Message::query()->create([
            'conversation_id' => $this->autreFil()->id, 'sender_id' => $this->locataire->id, 'type' => 'text',
            'visibility' => 'all', 'content' => 'Ailleurs',
        ]);
        $this->sortieDuModele = ['reponse' => 'Oui.', 'texte' => 'Bonjour.', 'sources' => $this->appuis($ici, $ailleurs), 'appuis' => $this->appuis($ici, $ailleurs)];

        $this->demander('question', ['question' => 'A-t-il confirmé ?'])->assertStatus(202);
        $this->demander('brouillon', ['ton' => 'court'])->assertStatus(202);

        $question = $this->derniere('fil.question');
        $this->assertEquals([['type' => 'message', 'id' => (int) $ici->id]], $question->proposal['sources']);
        $this->assertSame('A-t-il confirmé ?', $question->proposal['question']);
        $brouillon = $this->derniere('fil.brouillon');
        $this->assertEquals([['type' => 'message', 'id' => (int) $ici->id]], $brouillon->proposal['appuis']);
        $this->assertSame('court', $brouillon->proposal['ton']);
    }

    public function test_ac3_aucune_sorte_n_ecrit_un_message_et_l_etat_rend_la_proposition(): void
    {
        $this->ecrireUnMessage('Bonjour', $this->locataire);
        $avant = Message::query()->count();
        $engagements = Commitment::query()->count();

        $this->demander('question', ['question' => 'Quoi ?'])->assertStatus(202);
        $this->demander('brouillon', [])->assertStatus(202);

        $this->assertSame($avant, Message::query()->count());
        $this->assertSame($engagements, Commitment::query()->count());
        $etat = $this->etatDuCopilote($this->auteur)->assertOk();
        $this->assertSame('prete', $etat->json('data.sortes.question.statut'));
        $this->assertSame('prete', $etat->json('data.sortes.brouillon.statut'));
        $this->assertSame('Bonjour, nous revenons vers vous.', $etat->json('data.sortes.brouillon.proposition.texte'));

        // AC4 — le collègue du même fil ne lit pas la réponse de l'autre.
        $this->assertSame('aucun', $this->etatDuCopilote($this->collegue)->json('data.sortes.question.statut'));
    }

    public function test_la_question_est_requise_et_bornee_le_ton_ferme(): void
    {
        $this->demander('question', [])->assertStatus(422);
        $this->demander('question', ['question' => str_repeat('a', 501)])->assertStatus(422);
        $this->demander('brouillon', ['ton' => 'long'])->assertStatus(422);
        $this->assertSame([], $this->entreesRecues);
    }

    public function test_une_sorte_coupee_rend_409_sans_appel(): void
    {
        config(['ai.copilote.fonctions.brouillon' => false]);

        $this->demander('brouillon', [])->assertStatus(409)->assertJsonPath('code', 'copilote.coupe');
        $this->assertSame([], $this->entreesRecues);
    }

    /** @param  array<string, mixed>  $corps */
    private function demander(string $sorte, array $corps): TestResponse
    {
        Sanctum::actingAs($this->auteur);

        return $this->postJson('/api/conversations/'.$this->fil->id.'/copilote/'.$sorte, $corps);
    }

    private function derniere(string $usage): AiSuggestion
    {
        return AiSuggestion::query()->where('usage_key', $usage)->orderByDesc('id')->firstOrFail();
    }

    private function autreFil(): Conversation
    {
        return $this->groupe([$this->auteur, $this->locataire]);
    }

    /** @return list<array<string, mixed>> */
    private function appuis(Message $ici, Message $ailleurs): array
    {
        return [
            ['type' => 'message', 'id' => (int) $ici->id, 'objet_type' => ''],
            ['type' => 'message', 'id' => (int) $ailleurs->id, 'objet_type' => ''],
            ['type' => 'message', 'id' => 999999, 'objet_type' => ''],
            ['type' => 'objet', 'id' => (int) $this->bail->id + 1000, 'objet_type' => 'lease'],
        ];
    }
}
