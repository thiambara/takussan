<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-988 (piste P58.03) — la liste des relevés ne lance pas une requête de lignes par relevé.
 *
 * Mesuré avant correctif : `reconciled_ratio` est un accesseur qui comptait les lignes du relevé à
 * chaque lecture, et l'index ne préchargeait rien — 2 relevés, 2 requêtes `bank_statement_lines` ;
 * 12 relevés, 12. Le front demande la liste par 50.
 */
class BankStatementListQueryBudgetTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
    }

    private function releve(): BankStatement
    {
        $releve = BankStatement::factory()->create(['agency_id' => $this->agency->id, 'uploaded_by' => $this->admin->id]);
        foreach ([
            BankStatementLineMatchStatus::Confirmed,
            BankStatementLineMatchStatus::Confirmed,
            BankStatementLineMatchStatus::Ignored,
            BankStatementLineMatchStatus::Suggested,
            BankStatementLineMatchStatus::Unmatched,
        ] as $statut) {
            BankStatementLine::factory()->create(['bank_statement_id' => $releve->id, 'match_status' => $statut]);
        }

        return $releve;
    }

    /** @return array{lignes: int, data: array<int, mixed>} */
    private function lister(string $requete = '?per_page=50'): array
    {
        $lignes = 0;
        DB::listen(function ($query) use (&$lignes): void {
            if (str_contains($query->sql, 'bank_statement_lines')) {
                $lignes++;
            }
        });

        $response = $this->actingAs($this->admin)
            ->getJson("/api/agencies/{$this->agency->id}/bank-statements{$requete}")
            ->assertOk();

        return ['lignes' => $lignes, 'data' => $response->json('data')];
    }

    public function test_le_nombre_de_requetes_sur_les_lignes_ne_depend_pas_du_nombre_de_releves(): void
    {
        $this->releve();
        $this->releve();
        $avec2 = $this->lister();

        foreach (range(1, 10) as $_) {
            $this->releve();
        }
        $avec12 = $this->lister();

        $this->assertCount(12, $avec12['data']);
        $this->assertSame($avec2['lignes'], $avec12['lignes'], 'une requête de lignes par relevé');
    }

    public function test_le_ratio_rendu_par_la_liste_est_celui_du_releve(): void
    {
        $releve = $this->releve();

        $data = $this->lister()['data'];

        $this->assertSame(['confirmed' => 2, 'ignored' => 1, 'remaining' => 2, 'total' => 5], $data[0]['reconciled_ratio']);
        $this->assertSame($releve->reconciled_ratio, $data[0]['reconciled_ratio']);
    }

    public function test_les_comptes_tiennent_sous_un_sparse_fieldset(): void
    {
        $this->releve();
        $this->releve();

        $resultat = $this->lister('?fields[bank_statements]=id,status');

        // Une seule requête cite les lignes : celle de la liste, qui porte les sous-requêtes de compte.
        $this->assertSame(1, $resultat['lignes']);
        $this->assertSame(['confirmed' => 2, 'ignored' => 1, 'remaining' => 2, 'total' => 5], $resultat['data'][1]['reconciled_ratio']);
    }
}
