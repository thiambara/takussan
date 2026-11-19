<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\MessageType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2969 (ADR-0130 § 2) — un engagement se lit comme son fil : la liste `GET …/commitments` et la carte
 * `commitment.noted`, pour tout lecteur du fil ; refusées au non-lecteur. Aucune coordonnée (AC5).
 */
class LectureDesEngagementsTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement;

    private const CLES_DE_CONTACT = '/phone|telephone|email|e_mail/i';

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
    }

    public function test_la_liste_du_fil_se_trie_en_retard_puis_par_echeance_puis_clos(): void
    {
        $clos = $this->engagement(['status' => CommitmentStatus::Kept, 'due_at' => now()->addDay()]);
        $loin = $this->engagement(['status' => CommitmentStatus::Open, 'due_at' => now()->addDays(9)]);
        $proche = $this->engagement(['status' => CommitmentStatus::Proposed, 'due_at' => now()->addDays(2)]);
        $retard = $this->engagement(['status' => CommitmentStatus::Open, 'due_at' => now()->subHour()]);
        $annule = $this->engagement(['status' => CommitmentStatus::Cancelled, 'due_at' => now()->addDays(3)]);

        Sanctum::actingAs($this->voisin);
        $data = $this->getJson("/api/conversations/{$this->fil->id}/commitments")->assertOk()->json('data');

        $this->assertSame([$retard->id, $proche->id, $loin->id, $clos->id, $annule->id], array_column($data, 'id'));
        $this->assertSame(['late', 'proposed', 'open', 'kept', 'cancelled'], array_column($data, 'etat'));
        $this->assertSame([], $this->clesDeContact($data));
        // Le voisin lit, ne fait aucun geste.
        // TCK-2970 — la projection gagne `update`, `keep`, `reopen`, `not_yet` et `remind`.
        $this->assertSame(['confirm' => false, 'cancel' => false, 'update' => false, 'keep' => false, 'reopen' => false, 'not_yet' => false, 'remind' => false], $data[1]['abilities']);
    }

    public function test_la_liste_est_refusee_a_qui_ne_lit_pas_le_fil(): void
    {
        $this->engagement();

        Sanctum::actingAs($this->etranger);
        $this->getJson("/api/conversations/{$this->fil->id}/commitments")->assertForbidden();
    }

    /** AC5 — la carte se relit pour le locataire lecteur du fil, sans contact ; un non-lecteur : indisponible. */
    public function test_la_carte_se_relit_pour_un_lecteur_du_fil_sans_contact(): void
    {
        Sanctum::actingAs($this->agent);
        $id = $this->postJson("/api/conversations/{$this->fil->id}/commitments", [
            'holder_id' => $this->locataire->id,
            'title' => 'Payer le reliquat',
            'due_at' => now()->addDays(2)->utc()->format('Y-m-d\TH:i:s\Z'),
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($this->locataire);
        $carte = collect($this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json('data'))
            ->firstWhere('type', MessageType::Card->value);
        $objet = $carte['object'];
        $this->assertSame($id, $objet['id']);
        $this->assertSame('Payer le reliquat', $objet['title']);
        $this->assertSame(['confirm' => true, 'cancel' => false, 'update' => false, 'keep' => false, 'reopen' => false, 'not_yet' => false, 'remind' => false], $objet['abilities']); // TCK-2970
        $this->assertSame($this->locataire->id, $objet['holder']['id']);
        $this->assertSame([], $this->clesDeContact($objet));
    }

    /** @return list<string> les clés de contact, à toute profondeur */
    private function clesDeContact(array $valeur): array
    {
        $trouvees = [];
        $parcourir = function (array $tableau) use (&$parcourir, &$trouvees): void {
            foreach ($tableau as $cle => $v) {
                if (is_string($cle) && preg_match(self::CLES_DE_CONTACT, $cle)) {
                    $trouvees[] = $cle;
                }
                if (is_array($v)) {
                    $parcourir($v);
                }
            }
        };
        $parcourir($valeur);

        return $trouvees;
    }
}
