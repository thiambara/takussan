<?php

namespace Tests\Feature\Messaging\Copilote;

use App\Models\AiSuggestion;
use App\Models\Commitment;
use App\Models\Message;
use App\Models\User;
use App\Support\TempsReel\TempsReel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\SceneDuCopilote;
use Tests\TestCase;

/**
 * TCK-2975 (ADR-0131 § 3) — `fil.promesses` : sans notes d'équipe (AC1), une suggestion par promesse, promesses
 * hors du fil écartées (AC2), aucun engagement créé (AC3), aucun appel sans rien de neuf, message déjà source d'un
 * engagement exclu, promesse masquée une fois notée par un collègue. Et les engagements en cours dans l'entrée du
 * brouillon.
 */
final class CopilotePromessesTest extends TestCase
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

    public function test_ac1_ac2_sans_note_une_suggestion_par_promesse_hors_du_fil_ecartee(): void
    {
        $jeudi = $this->ecrireUnMessage('Je repasse jeudi à 10 h pour la fuite.', $this->auteur);
        $recu = $this->ecrireUnMessage('Je vous envoie le reçu demain.', $this->locataire);
        $this->ecrireUneNote('NOTE_SECRETE_DE_L_EQUIPE');
        $ailleurs = $this->ecrireUnMessage('Ailleurs', $this->locataire, $this->groupe([$this->auteur, $this->locataire]));
        $etranger = User::factory()->create();
        $demain = now()->addDay()->startOfHour()->toAtomString();
        $this->sortieDuModele = ['promesses' => [
            ['message_id' => (int) $jeudi->id, 'porteur_id' => (int) $this->auteur->id, 'libelle' => 'Repasser pour la fuite', 'echeance' => $demain],
            ['message_id' => (int) $recu->id, 'porteur_id' => (int) $this->locataire->id, 'libelle' => 'Envoyer le reçu', 'echeance' => now()->subDay()->toAtomString()],
            ['message_id' => (int) $ailleurs->id, 'porteur_id' => (int) $this->locataire->id, 'libelle' => 'Hors du fil', 'echeance' => ''],
            ['message_id' => (int) $recu->id, 'porteur_id' => (int) $etranger->id, 'libelle' => 'Porteur absent', 'echeance' => ''],
        ]];
        $engagements = Commitment::query()->count();
        $messages = Message::query()->count();

        $this->demander()->assertStatus(202);

        $this->assertCount(1, $this->entreesRecues);
        $this->assertStringContainsString('Je repasse jeudi', $this->entreesRecues[0]);
        $this->assertStringNotContainsString('NOTE_SECRETE_DE_L_EQUIPE', $this->entreesRecues[0]);
        $this->assertSame(2, AiSuggestion::query()->where('usage_key', 'fil.promesses')->count());
        $this->assertSame($engagements, Commitment::query()->count());
        $this->assertSame($messages, Message::query()->count());

        $promesses = $this->etatDuCopilote($this->auteur)->assertOk()->json('data.sortes.promesses');
        $this->assertSame('prete', $promesses['statut']);
        $this->assertCount(2, $promesses['promesses']);
        $this->assertSame((int) $jeudi->id, $promesses['promesses'][0]['proposition']['message_id']);
        $this->assertSame('Repasser pour la fuite', $promesses['promesses'][0]['proposition']['libelle']);
        $this->assertNotNull($promesses['promesses'][0]['proposition']['echeance']);
        $this->assertNull($promesses['promesses'][1]['proposition']['echeance']);
        $this->assertIsInt($promesses['promesses'][0]['suggestion_id']);

        // AC4 — le collègue ne voit pas les promesses de l'autre.
        $this->assertSame([], $this->etatDuCopilote($this->collegue)->json('data.sortes.promesses.promesses'));
    }

    public function test_aucun_appel_sans_rien_de_neuf_puis_un_appel_au_message_suivant(): void
    {
        $this->ecrireUnMessage('Je passe demain.', $this->locataire);
        // `created_at` est à la seconde, et `premierNouveau()` relit (`>=`) une fois le message de la même seconde que
        // l'extraction : sans ce pas, le message et l'appel tombent ou non dans la même seconde selon l'horloge, et la
        // deuxième demande rend 202 au lieu de 200 (rouge intermittent de la CI de #1700). Le cas de la même seconde
        // est épinglé à part, ci-dessous.
        $this->travel(1)->seconds();
        $this->demander()->assertStatus(202);
        $this->assertCount(1, $this->entreesRecues);

        $this->travel(1)->minutes();
        $this->demander()->assertOk();
        $this->assertCount(1, $this->entreesRecues);

        $this->ecrireUnMessage('Finalement après-demain.', $this->locataire);
        $this->demander()->assertStatus(202);
        $this->assertCount(2, $this->entreesRecues);
        $this->assertStringContainsString('Finalement après-demain.', $this->entreesRecues[1]);
    }

    /**
     * `created_at` est à la seconde : un message de la même seconde que l'extraction est relu (`>=` de
     * `premierNouveau()`), jamais manqué — jusqu'à une extraction d'une seconde postérieure, qui le laisse derrière elle.
     */
    public function test_un_message_de_la_meme_seconde_que_l_extraction_est_relu_puis_laisse(): void
    {
        $this->freezeSecond();
        $this->ecrireUnMessage('Je passe demain.', $this->locataire);
        $this->demander()->assertStatus(202);

        $this->travel(1)->seconds();
        $this->demander()->assertStatus(202);
        $this->assertCount(2, $this->entreesRecues);

        $this->travel(1)->minutes();
        $this->demander()->assertOk();
        $this->assertCount(2, $this->entreesRecues);
    }

    public function test_un_message_deja_source_est_exclu_et_une_promesse_notee_par_un_collegue_masquee(): void
    {
        $note = $this->ecrireUnMessage('SOURCE_DEJA_NOTEE je repasse lundi.', $this->locataire);
        $this->engagementSur($note);
        $promis = $this->ecrireUnMessage('Je vous rappelle vendredi.', $this->locataire);
        $this->sortieDuModele = ['promesses' => [
            ['message_id' => (int) $promis->id, 'porteur_id' => (int) $this->locataire->id, 'libelle' => 'Rappeler', 'echeance' => ''],
        ]];

        $this->demander()->assertStatus(202);
        $this->assertStringNotContainsString('SOURCE_DEJA_NOTEE', $this->entreesRecues[0]);
        $this->assertCount(1, $this->etatDuCopilote($this->auteur)->json('data.sortes.promesses.promesses'));

        $this->engagementSur($promis);

        $this->assertSame([], $this->etatDuCopilote($this->auteur)->json('data.sortes.promesses.promesses'));
    }

    public function test_le_brouillon_lit_les_engagements_en_cours_du_fil_et_peut_s_y_appuyer(): void
    {
        $source = $this->ecrireUnMessage('Je repasse lundi.', $this->auteur);
        $engagement = $this->engagementSur($source, ['title' => 'ENGAGEMENT_EN_COURS', 'due_at' => now()->subDay()]);
        $this->sortieDuModele = ['texte' => 'Bonjour.', 'appuis' => [
            ['nature' => 'objet', 'id' => (int) $engagement->id, 'objet_type' => 'commitment'],
            ['nature' => 'objet', 'id' => (int) $engagement->id + 100, 'objet_type' => 'commitment'],
        ]];

        Sanctum::actingAs($this->auteur);
        $this->postJson('/api/conversations/'.$this->fil->id.'/copilote/brouillon', [])->assertStatus(202);

        $this->assertStringContainsString('ENGAGEMENT_EN_COURS', $this->entreesRecues[0]);
        $this->assertStringContainsString('"en_retard":true', $this->entreesRecues[0]);
        $appuis = AiSuggestion::query()->where('usage_key', 'fil.brouillon')->firstOrFail()->proposal['appuis'];
        $this->assertEquals([['type' => 'objet', 'id' => (int) $engagement->id, 'objet_type' => 'commitment']], $appuis);
    }

    private function demander(): TestResponse
    {
        Sanctum::actingAs($this->auteur);

        return $this->postJson('/api/conversations/'.$this->fil->id.'/copilote/promesses');
    }

    /** @param  array<string, mixed>  $attributs */
    private function engagementSur(Message $source, array $attributs = []): Commitment
    {
        return Commitment::factory()->create(array_merge([
            'conversation_id' => $this->fil->id,
            'source_message_id' => $source->id,
            'agency_id' => $this->agence->id,
            'holder_id' => $this->locataire->id,
            'created_by_id' => $this->collegue->id,
        ], $attributs));
    }
}
