<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Agency;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-2987 (ADR-0130 § 6) — la fiabilité dans `GET /api/conversations/{c}/context` : deux entiers par
 * participant, au SEUL personnel actif de l'agence du fil ; la clé est ABSENTE pour tout autre (AC1).
 * Seules comptent l'agence du fil et les 90 derniers jours (AC2), hors `proposed` et `cancelled`.
 */
class FiabiliteTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement, SessionsDImpersonation;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
    }

    /** @return array<string, mixed> */
    private function contexte(User $lecteur): array
    {
        Sanctum::actingAs($lecteur);

        return $this->getJson("/api/conversations/{$this->fil->id}/context")->assertOk()->json('data');
    }

    /** @param  array<string, mixed>  $attributs */
    private function tenu(array $attributs = []): void
    {
        $this->engagement($attributs + ['status' => CommitmentStatus::Kept, 'kept_at' => now(), 'due_at' => now()->subDays(3)]);
    }

    public function test_le_personnel_lit_deux_entiers_par_participant_dans_l_agence_et_la_fenetre(): void
    {
        // Compté pour le locataire : 2 tenus, 1 tenu en retard (overdue_at), 1 ouvert échu, 1 reporté après son retard.
        $this->tenu();
        $this->tenu(['due_at' => now()->subDays(80)]);
        $this->tenu(['overdue_at' => now()->subDays(4)]);
        $this->engagement(['status' => CommitmentStatus::Open, 'due_at' => now()->subDay()]);
        $this->engagement(['status' => CommitmentStatus::Open, 'due_at' => now()->subHour(), 'overdue_at' => now()->subDays(2)]);
        // Non comptés : hors fenêtre, proposé, annulé, ouvert à venir, autre agence.
        $this->tenu(['due_at' => now()->subDays(91)]);
        $this->engagement(['status' => CommitmentStatus::Proposed, 'due_at' => now()->subDay()]);
        $this->engagement(['status' => CommitmentStatus::Cancelled, 'due_at' => now()->subDay(), 'overdue_at' => now()->subDay()]);
        $this->engagement(['status' => CommitmentStatus::Open, 'due_at' => now()->addDay()]);
        $this->tenu(['agency_id' => Agency::factory()->create()->id, 'overdue_at' => now()->subDays(5)]);

        $fiabilite = $this->contexte($this->agent)['commitments_records'];

        $this->assertSame(['kept' => 2, 'late' => 3], $fiabilite[(string) $this->locataire->id]);
        $this->assertSame(['kept' => 0, 'late' => 0], $fiabilite[(string) $this->voisin->id]);
        // Chaque participant actif AUTRE que l'appelant, et rien d'autre.
        $this->assertEqualsCanonicalizing([(string) $this->locataire->id, (string) $this->voisin->id], array_map('strval', array_keys($fiabilite)));
    }

    /** AC1 — la clé est absente pour la personne elle-même, un client, un agent d'une autre agence. */
    public function test_la_cle_est_absente_hors_du_personnel_de_l_agence(): void
    {
        $this->tenu();
        $autreAgent = $this->agentOf(Agency::factory()->create());
        $this->fil->participants()->attach($autreAgent->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        foreach (['locataire' => $this->locataire, 'voisin' => $this->voisin, 'agent d\'une autre agence' => $autreAgent] as $nom => $lecteur) {
            $this->assertArrayNotHasKey('commitments_records', $this->contexte($lecteur), "{$nom} lit la fiabilité");
        }
        // Le témoin : le personnel la lit.
        $this->assertArrayHasKey('commitments_records', $this->contexte($this->agent));
    }

    /** AC1 — sous impersonation d'un locataire, on lit ce qu'il lit : rien ; le super-admin seul : rien non plus. */
    public function test_la_cle_est_absente_sous_impersonation_d_un_locataire_et_pour_le_super_admin(): void
    {
        $this->tenu();
        ['operateur' => $operateur, 'jeton' => $jeton] = $this->ouvrirUneSession(cible: $this->locataire);

        $this->avecLeJeton($jeton);
        $data = $this->getJson("/api/conversations/{$this->fil->id}/context")->assertOk()->json('data');
        $this->assertArrayNotHasKey('commitments_records', $data, 'impersonation du locataire');

        $this->commeOperateur($operateur);
        $data = $this->getJson("/api/conversations/{$this->fil->id}/context")->assertOk()->json('data');
        $this->assertArrayNotHasKey('commitments_records', $data, 'super-admin');
    }

    /** AC5 — une requête pour tous les participants : 5 de plus ne coûtent rien. */
    public function test_les_requetes_sont_constantes_avec_cinq_participants_de_plus(): void
    {
        $this->tenu();
        $avant = $this->requetes();
        for ($i = 0; $i < 5; $i++) {
            $p = User::factory()->create();
            $this->fil->participants()->attach($p->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);
            $this->tenu(['holder_id' => $p->id]);
        }
        $apres = $this->requetes();

        $engagements = fn (array $r) => count(array_filter($r, fn (string $sql) => str_contains($sql, 'from "commitments"')));
        $this->assertSame(1, $engagements($apres));
        $this->assertSame($engagements($avant), $engagements($apres));
    }

    /** @return list<string> */
    private function requetes(): array
    {
        Sanctum::actingAs($this->agent);
        $this->getJson("/api/conversations/{$this->fil->id}/context")->assertOk();
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson("/api/conversations/{$this->fil->id}/context")->assertOk();
        $requetes = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        return $requetes;
    }
}
