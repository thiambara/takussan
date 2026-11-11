<?php

namespace Tests\Feature\Accounting;

use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Support\RapprochementFixture;

/**
 * TCK-2674 (AC4) — `GET /api/agencies/{agency}/bank-statement-lines` : chercher, à l'échelle de
 * l'agence, la ligne d'un paiement donné — par statut, montant et dates — parmi les relevés encore
 * ouverts au rapprochement.
 */
class BankStatementLinesSearchTest extends ApiTestCase
{
    use RapprochementFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpRapprochement();
    }

    private function search(string $query = '', ?User $as = null): TestResponse
    {
        $this->actingAsApi($as ?? $this->admin);

        return $this->getJson("/api/agencies/{$this->agency->id}/bank-statement-lines?".ltrim($query, '&'));
    }

    /** @param  array<string, mixed>  $attributes */
    private function line(array $attributes = [], ?int $statementId = null): BankStatementLine
    {
        return BankStatementLine::factory()->create($attributes + [
            'bank_statement_id' => $statementId ?? $this->statement()->id,
            'amount' => 150000, 'posted_at' => '2026-11-10', 'match_status' => BankStatementLineMatchStatus::Unmatched,
        ]);
    }

    /** @return list<int> */
    private function ids(TestResponse $response): array
    {
        return collect($response->assertOk()->json('data'))->pluck('id')->all();
    }

    public function test_par_statut_montant_et_dates(): void
    {
        $statement = $this->statement()->id;
        $hit = $this->line(statementId: $statement);
        $this->line(['amount' => 150500], $statement);
        $this->line(['posted_at' => '2026-10-30'], $statement);
        $this->line(['match_status' => BankStatementLineMatchStatus::Ignored], $statement);
        $near = $this->line(['amount' => 150000.4], $statement);

        $this->assertSame(
            [$hit->id, $near->id],
            $this->ids($this->search('filter[match_status]=unmatched&filter[amount]=150000&filter[date_from]=2026-11-01&filter[date_to]=2026-11-30&sort=id')),
        );
    }

    public function test_seulement_les_releves_ouverts_de_l_agence(): void
    {
        $open = $this->line();
        $this->line(statementId: $this->statement(['status' => BankStatementStatus::Reconciled])->id);
        $this->line(statementId: $this->statement(['status' => BankStatementStatus::Processing])->id);
        $this->line(statementId: $this->statement(agency: $this->otherAgency)->id);

        $this->assertSame([$open->id], $this->ids($this->search()));
    }

    public function test_la_forme_d_une_ligne_et_la_borne_de_date(): void
    {
        $line = $this->line(['label' => 'VIR AWA DIOP']);

        $this->search('filter[date_to]=2026-11-10')->assertOk()
            ->assertJsonPath('data.0.id', $line->id)
            ->assertJsonPath('data.0.bank_statement_id', $line->bank_statement_id)
            ->assertJsonPath('data.0.label', 'VIR AWA DIOP')
            ->assertJsonPath('data.0.posted_at', '2026-11-10')
            ->assertJsonPath('meta.total', 1);
        $this->assertSame([], $this->ids($this->search('filter[date_from]=2026-11-11')));
        $this->assertSame([$line->id], $this->ids($this->search('filter[date_from]=2026-11-10')));
    }

    public function test_des_filtres_mal_formes_rendent_422(): void
    {
        $this->search('filter[match_status]=perdu')->assertUnprocessable();
        $this->search('filter[amount]=beaucoup')->assertUnprocessable();
        $this->search('filter[date_from]=2026-11-20&filter[date_to]=2026-11-01')->assertUnprocessable();
        // Une valeur en liste n'accuse jamais le serveur (ADR-0075 § 3), y compris la borne que
        // `after_or_equal` compare.
        $this->search('filter[date_from][]=2026-11-01&filter[date_to]=2026-11-30')->assertUnprocessable();
        $this->search('filter[match_status][]=unmatched&filter[amount][]=1')->assertUnprocessable();
    }

    public function test_ac4_un_agent_et_une_autre_agence_recoivent_403(): void
    {
        $this->search(as: $this->agent)->assertForbidden();
        $this->search(as: $this->otherAdmin)->assertForbidden();
    }
}
