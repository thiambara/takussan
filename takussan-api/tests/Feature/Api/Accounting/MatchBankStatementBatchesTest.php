<?php

namespace Tests\Feature\Api\Accounting;

use App\Jobs\Accounting\MatchBankStatementJob;
use App\Jobs\Accounting\MatchBankStatementLinesJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Customer;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\Currency;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Accounting\ReconciliationMatcher;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * TCK-933 (P43.02) — le rapprochement d'un relevé est découpé en lots, chacun son job borné, et
 * le relevé n'est plus relu à chaque ligne.
 *
 * Mesuré avant correctif : `MatchBankStatementJob` parcourait toutes les lignes `unmatched` dans
 * un seul job, sans délai propre (60 s du worker), à 4 requêtes par ligne dont une relecture du
 * relevé (500 lignes → 2 002 requêtes, 7,7 s sur base vide). Au délai, le processus était tué et
 * les lignes restantes restaient `unmatched`, sans reprise.
 */
class MatchBankStatementBatchesTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private BankStatement $statement;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->statement = BankStatement::factory()->create(['agency_id' => $this->agency->id]);
    }

    public function test_le_rapprochement_est_reparti_en_lots_bornes_des_seules_lignes_a_rapprocher(): void
    {
        $lignes = BankStatementLine::factory()->count(450)->create($this->ligne());
        $deja = BankStatementLine::factory()->suggested(LeasePayment::class, 1, 60)->create(['bank_statement_id' => $this->statement->id]);
        $autreReleve = BankStatementLine::factory()->create(['match_status' => BankStatementLineMatchStatus::Unmatched]);

        Queue::fake();

        (new MatchBankStatementJob($this->statement->id))->handle(app(ReconciliationMatcher::class));

        $lots = Queue::pushed(MatchBankStatementLinesJob::class);
        $this->assertCount(3, $lots);

        $ids = $lots->flatMap(function (MatchBankStatementLinesJob $job) {
            $this->assertSame($this->statement->id, $job->statementId);
            $this->assertLessThanOrEqual(MatchBankStatementLinesJob::LOT, count($job->lineIds));
            $this->assertSame('reconciliation', $job->queue);

            return $job->lineIds;
        })->sort()->values()->all();

        $this->assertSame($lignes->pluck('id')->sort()->values()->all(), $ids);
        $this->assertNotContains($deja->id, $ids);
        $this->assertNotContains($autreReleve->id, $ids);
    }

    public function test_le_releve_n_est_lu_qu_une_fois_par_lot_et_les_suggestions_sont_posees(): void
    {
        $payment = $this->leasePayment('LP-REF-42', 15000, '2026-04-01');

        $cible = BankStatementLine::factory()->create($this->ligne([
            'reference' => 'LP-REF-42',
            'amount' => 15000,
            'posted_at' => '2026-04-01',
        ]));
        BankStatementLine::factory()->count(99)->create($this->ligne());

        $lecturesDuReleve = 0;
        DB::listen(function (QueryExecuted $query) use (&$lecturesDuReleve): void {
            if (preg_match('/from "bank_statements"/', $query->sql)) {
                $lecturesDuReleve++;
            }
        });

        // File synchrone (`phpunit.xml`) : les lots s'exécutent en ligne.
        (new MatchBankStatementJob($this->statement->id))->handle(app(ReconciliationMatcher::class));

        // Une lecture par le répartiteur, une par lot, et une par ligne SUGGÉRÉE pour l'agence de
        // son activité d'audit (`BankStatementLine::auditAgencyId()`, hors de ce ticket) — jamais
        // une par ligne parcourue. Avant correctif : 102.
        $this->assertLessThanOrEqual(3, $lecturesDuReleve, "Le relevé est relu {$lecturesDuReleve} fois pour 100 lignes.");

        $cible->refresh();
        $this->assertSame(BankStatementLineMatchStatus::Suggested, $cible->match_status);
        $this->assertSame($payment->id, $cible->matched_payment_id);
        $this->assertSame(95, $cible->match_confidence);
    }

    public function test_un_lot_rejoue_ne_retouche_pas_une_ligne_deja_traitee(): void
    {
        $ligne = BankStatementLine::factory()->suggested(LeasePayment::class, 123, 60)->create(['bank_statement_id' => $this->statement->id]);

        (new MatchBankStatementLinesJob($this->statement->id, [$ligne->id]))->handle(app(ReconciliationMatcher::class));

        $ligne->refresh();
        $this->assertSame(123, $ligne->matched_payment_id);
        $this->assertSame(60, $ligne->match_confidence);
    }

    public function test_les_delais_sont_sous_le_retry_after_de_chaque_connexion(): void
    {
        $retryAfters = collect(config('queue.connections'))
            ->filter(fn (array $connection) => isset($connection['retry_after']))
            ->map(fn (array $connection) => (int) $connection['retry_after']);
        $this->assertArrayHasKey('database', $retryAfters->all());

        foreach ([new MatchBankStatementJob(1), new MatchBankStatementLinesJob(1, [])] as $job) {
            $this->assertIsInt($job->timeout ?? null, $job::class.' : sans délai propre, celui du worker (60 s) s\'applique.');
            foreach ($retryAfters as $name => $retryAfter) {
                $this->assertLessThan($retryAfter, $job->timeout, $job::class." : `{$name}` retry_after={$retryAfter} s.");
            }
        }
    }

    /** @param array<string, mixed> $attributes */
    private function ligne(array $attributes = []): array
    {
        return array_merge([
            'bank_statement_id' => $this->statement->id,
            'match_status' => BankStatementLineMatchStatus::Unmatched,
            'reference' => null,
            'counterparty' => null,
        ], $attributes);
    }

    private function leasePayment(string $reference, int $amount, string $paidAt): LeasePayment
    {
        $lease = Lease::factory()->create(['agency_id' => $this->agency->id]);

        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'currency' => Currency::XOF,
            'reference_number' => $reference,
            'amount' => $amount,
            'paid_at' => $paidAt,
            'bank_reconciled_at' => null,
            'bank_statement_line_id' => null,
        ]);
    }
}
