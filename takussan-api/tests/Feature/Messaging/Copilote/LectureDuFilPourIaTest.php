<?php

namespace Tests\Feature\Messaging\Copilote;

use App\Models\Agency;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Models\Lease;
use App\Models\Message;
use App\Services\Messaging\Copilote\LectureDuFilPourIa;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\Support\SceneDuCopilote;
use Tests\TestCase;

/**
 * TCK-2974 (ADR-0131 § 2, AC2, AC3) — ce que le copilote lit d'un fil, mesuré dans l'entrée REÇUE PAR LE FAUX
 * MODÈLE : ce que le lecteur lit, notes d'équipe comprises sauf option, aucun autre fil, les objets par leur
 * projection fermée pour lui, téléphones et adresses électroniques masqués.
 */
class LectureDuFilPourIaTest extends TestCase
{
    use RefreshDatabase, SceneDuCopilote;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
        $this->installerLeCopilote();
    }

    public function test_ac2_telephone_et_adresse_electronique_n_atteignent_pas_le_modele(): void
    {
        $depuis = $this->ecrireDesMessages(11, $this->locataire)->id;
        $this->ecrireDesMessages(1, $this->locataire, texte: 'Appelez-moi au 77 123 45 67 ou écrivez à awa.diop@exemple.sn');

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);

        $this->assertCount(1, $this->entreesRecues);
        $entree = $this->entreesRecues[0];
        $this->assertStringNotContainsString('77 123 45 67', $entree);
        $this->assertStringNotContainsString('awa.diop@exemple.sn', $entree);
        $this->assertStringContainsString('[TELEPHONE]', $entree);
        $this->assertStringContainsString('[EMAIL]', $entree);
        $this->assertStringContainsString('contenu_externe_', $entree);
    }

    public function test_les_notes_d_equipe_entrent_dans_le_resume(): void
    {
        $depuis = $this->ecrireDesMessages(11, $this->locataire)->id;
        $this->ecrireUneNote('NOTE_INTERNE_DU_RESUME');

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);

        $this->assertStringContainsString('NOTE_INTERNE_DU_RESUME', $this->entreesRecues[0]);
    }

    public function test_ac3_sans_notes_d_equipe_une_note_n_est_pas_dans_l_entree(): void
    {
        $depuis = $this->ecrireDesMessages(3, $this->locataire)->id;
        $note = $this->ecrireUneNote('NOTE_INTERNE_EXCLUE');
        $this->assertSame(MessageVisibility::Team, $note->visibility);

        $avec = $this->lire($depuis, true);
        $sans = $this->lire($depuis, false);

        $this->assertStringContainsString('NOTE_INTERNE_EXCLUE', $avec['texte']);
        $this->assertStringNotContainsString('NOTE_INTERNE_EXCLUE', $sans['texte']);
        $this->assertNotContains((int) $note->id, $sans['ids']);
    }

    public function test_un_message_d_un_autre_fil_est_absent(): void
    {
        $autre = $this->groupe([$this->auteur, $this->locataire], ['property_id' => $this->bien->id]);
        $this->ecrireDesMessages(2, $this->locataire, $autre, 'SECRET_D_UN_AUTRE_FIL');
        $depuis = $this->ecrireDesMessages(10, $this->locataire)->id;

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);

        $this->assertStringNotContainsString('SECRET_D_UN_AUTRE_FIL', $this->entreesRecues[0]);
    }

    public function test_une_carte_d_un_objet_que_le_lecteur_ne_lit_pas_est_indisponible_et_le_sujet_reste_dans_sa_projection(): void
    {
        $etranger = Lease::factory()->create(['agency_id' => Agency::factory()->create()->id, 'reference_number' => 'BAIL-ETRANGER-4242']);
        $this->bail->forceFill(['deposit_refund_reason' => 'SENTINELLE_HORS_PROJECTION'])->save();
        $depuis = $this->ecrireDesMessages(10, $this->locataire)->id;
        Message::query()->create([
            'conversation_id' => $this->fil->id, 'sender_id' => $this->locataire->id, 'content' => 'card.shared',
            'type' => MessageType::Card->value, 'visibility' => MessageVisibility::All->value,
            'metadata' => ['code' => 'card.shared', 'object' => ['type' => 'lease', 'id' => $etranger->id]],
        ]);

        $this->demanderUnResume($this->auteur, $depuis)->assertStatus(202);

        $entree = $this->entreesRecues[0];
        $this->assertStringNotContainsString('BAIL-ETRANGER-4242', $entree);
        $this->assertStringContainsString('"indisponible":true', $entree);
        // Le sujet (le bail du fil) arrive par sa projection fermée : sa référence oui, un champ hors projection non.
        $this->assertStringContainsString((string) $this->bail->reference_number, $entree);
        $this->assertStringNotContainsString('SENTINELLE_HORS_PROJECTION', $entree);
    }

    /** @return array{texte: string, ids: list<int>} */
    private function lire(int $depuis, bool $avecNotes): array
    {
        $requete = Request::create('/');
        $requete->setUserResolver(fn () => $this->auteur);

        return app(LectureDuFilPourIa::class)->lire($this->auteur, $this->fil, $requete, $depuis, (int) Message::query()->max('id'), $avecNotes);
    }
}
