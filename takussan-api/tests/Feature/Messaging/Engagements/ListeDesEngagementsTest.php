<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2987 (ADR-0130 § 6) — `GET /api/commitments` : les engagements du lecteur, dans les fils qu'il lit
 * (AC3), `owed` hors de son côté (AC4), `mine`, l'état en SQL, les comptes sans les filtres, et un nombre
 * de requêtes constant (AC5).
 */
class ListeDesEngagementsTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement;

    private User $collegue;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
        $this->collegue = $this->agentOf($this->agence);
        $this->fil->participants()->attach($this->collegue->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
    }

    /** @return array{ids: list<int>, counts: array<string, int>} */
    private function liste(User $lecteur, string $requete = ''): array
    {
        Sanctum::actingAs($lecteur);
        $reponse = $this->getJson('/api/commitments'.$requete)->assertOk();

        return ['ids' => array_column($reponse->json('data'), 'id'), 'counts' => $reponse->json('meta.counts')];
    }

    public function test_owed_et_mine_pour_un_locataire(): void
    {
        $duParVoisin = $this->engagement(['holder_id' => $this->voisin->id, 'beneficiary_id' => $this->locataire->id, 'status' => CommitmentStatus::Open]);
        $duParAgent = $this->engagement(['holder_id' => $this->agent->id, 'beneficiary_id' => $this->locataire->id, 'status' => CommitmentStatus::Open, 'due_at' => now()->addDays(5)]);
        $sien = $this->engagement(['holder_id' => $this->locataire->id, 'status' => CommitmentStatus::Open]);
        // Ni porteur ni bénéficiaire : ni l'un ni l'autre.
        $this->engagement(['holder_id' => $this->voisin->id, 'beneficiary_id' => $this->agent->id]);

        $this->assertEqualsCanonicalizing([$duParVoisin->id, $duParAgent->id], $this->liste($this->locataire, '?filter[role]=owed')['ids']);
        $this->assertSame([$sien->id], $this->liste($this->locataire, '?filter[role]=mine')['ids']);
        $this->assertSame(['owed' => 2, 'mine' => 1, 'late' => 0], $this->liste($this->locataire)['counts']);
    }

    /** AC4 — le personnel suit ce que doivent les autres, jamais un collègue. */
    public function test_owed_exclut_le_cote_du_lecteur(): void
    {
        $duParLocataire = $this->engagement(['holder_id' => $this->locataire->id]);
        $duParCollegue = $this->engagement(['holder_id' => $this->collegue->id, 'beneficiary_id' => $this->agent->id]);

        $ids = $this->liste($this->agent, '?filter[role]=owed')['ids'];
        $this->assertContains($duParLocataire->id, $ids);
        $this->assertNotContains($duParCollegue->id, $ids);
    }

    /** AC3 — rien d'un fil que le lecteur ne lit pas, même s'il en est le bénéficiaire. */
    public function test_aucun_engagement_d_un_fil_que_le_lecteur_ne_lit_pas(): void
    {
        $ailleurs = $this->groupe([$this->agent, $this->voisin], ['property_id' => $this->bien->id]);
        $this->engagement(['conversation_id' => $ailleurs->id, 'holder_id' => $this->voisin->id, 'beneficiary_id' => $this->locataire->id]);

        $this->assertSame([], $this->liste($this->locataire)['ids']);
        $this->assertSame(['owed' => 0, 'mine' => 0, 'late' => 0], $this->liste($this->locataire)['counts']);
    }

    public function test_chaque_etat_se_filtre_et_les_comptes_ne_bougent_pas(): void
    {
        $base = ['holder_id' => $this->locataire->id];
        $enRetard = $this->engagement($base + ['status' => CommitmentStatus::Open, 'due_at' => now()->subHour()]);
        $ouvert = $this->engagement($base + ['status' => CommitmentStatus::Open, 'due_at' => now()->addDay()]);
        $propose = $this->engagement($base + ['status' => CommitmentStatus::Proposed]);
        $tenu = $this->engagement($base + ['status' => CommitmentStatus::Kept]);
        $annule = $this->engagement($base + ['status' => CommitmentStatus::Cancelled]);

        $attendus = ['late' => $enRetard, 'open' => $ouvert, 'proposed' => $propose, 'kept' => $tenu, 'cancelled' => $annule];
        $comptes = ['owed' => 0, 'mine' => 5, 'late' => 1];
        foreach ($attendus as $etat => $engagement) {
            $liste = $this->liste($this->locataire, "?filter[etat]={$etat}");
            $this->assertSame([$engagement->id], $liste['ids'], $etat);
            $this->assertSame($comptes, $liste['counts'], "comptes sous filter[etat]={$etat}");
        }
        $this->assertSame([], $this->liste($this->locataire, '?filter[etat]=unguard')['ids']);
        $this->assertSame([], $this->liste($this->locataire, '?filter[role]=all')['ids']);

        // En retard d'abord, puis par échéance.
        $this->assertSame($enRetard->id, $this->liste($this->locataire)['ids'][0]);
    }

    public function test_chaque_ligne_porte_son_fil_sans_contact(): void
    {
        $this->engagement(['holder_id' => $this->locataire->id]);
        Sanctum::actingAs($this->locataire);
        $ligne = $this->getJson('/api/commitments')->assertOk()->json('data.0');

        $this->assertSame(['id' => $this->fil->id, 'title' => 'Coordination'], $ligne['conversation']);
        $this->assertStringNotContainsString('+22177', json_encode($ligne));
        $this->assertStringNotContainsString('@example.test', json_encode($ligne));
    }

    /** AC5 — de 1 à 30 lignes, le même nombre de requêtes. */
    public function test_les_requetes_sont_constantes_de_un_a_trente_lignes(): void
    {
        $this->engagement(['holder_id' => $this->locataire->id, 'beneficiary_id' => $this->voisin->id]);
        $un = $this->requetes();
        for ($i = 0; $i < 29; $i++) {
            $this->engagement(['holder_id' => $this->locataire->id, 'beneficiary_id' => $this->voisin->id]);
        }
        $trente = $this->requetes();

        $this->assertSame(count($un), count($trente), 'requêtes pour 1 ligne : '.count($un).', pour 30 : '.count($trente));
    }

    /** @return list<string> */
    private function requetes(): array
    {
        Sanctum::actingAs($this->locataire);
        $this->getJson('/api/commitments?per_page=50')->assertOk();
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson('/api/commitments?per_page=50')->assertOk();
        $requetes = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        return $requetes;
    }
}
