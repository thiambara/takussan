<?php

namespace Tests\Feature\Api\Accounting;

use App\Jobs\Accounting\MatchBankStatementJob;
use App\Jobs\Accounting\ParseBankStatementJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Customer;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\Currency;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Accounting\ReconciliationMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\ApiTestCase;

/**
 * TCK-285 — Le pipeline de rapprochement bancaire, DÉROULÉ POUR DE VRAI.
 *
 * `BankReconciliationTest` couvre les huit surfaces HTTP du rapprochement,
 * mais il ouvre par `Queue::fake()` : `ParseBankStatementJob::handle`,
 * `MatchBankStatementJob::handle` et les cinq méthodes de
 * `ReconciliationMatcher` n'y sont jamais exécutés. Mesuré le 2026-08-15 :
 * 0/52, 0/18 et 0/85 lignes — 155 lignes de logique d'argent qui tournent en
 * production à CHAQUE dépôt de relevé et que rien ne garde.
 *
 * Ce fichier est délibérément SÉPARÉ de `BankReconciliationTest` : y retirer
 * le `Queue::fake()` ferait créer aux jobs des lignes en plus de celles des
 * factories, et casserait ses huit cas actuels.
 *
 * `QUEUE_CONNECTION=sync` est forcé par `phpunit.xml` : ne pas faker la file
 * suffit à exécuter le job en ligne, et le chaînage `Parse → Match` avec.
 */
class BankStatementPipelineTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $this->agency = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
    }

    // ─── Parse ───────────────────────────────────────────────────

    public function test_upload_parses_every_line_and_flips_the_statement_to_ready_for_review(): void
    {
        $statement = $this->upload($this->fixture());

        $this->assertSame(BankStatementStatus::ReadyForReview, $statement->status);
        $this->assertSame(10, $statement->lines_count);
        $this->assertSame(10, $statement->lines()->count());

        // Les bornes de période sont dérivées des dates PARSÉES, pas du fichier.
        $this->assertSame('2026-04-01', $statement->period_start->toDateString());
        $this->assertSame('2026-04-20', $statement->period_end->toDateString());
    }

    public function test_a_negative_amount_becomes_a_debit_line_stored_positive(): void
    {
        $statement = $this->upload($this->fixture());

        // « 03/04/2026,-5000,Frais bancaires » — le signe porte la DIRECTION,
        // le montant est stocké en valeur absolue. Une régression qui garde le
        // signe rendrait tous les soldes faux.
        $fees = $statement->lines()->where('label', 'Frais bancaires')->sole();

        $this->assertSame(BankStatementLineDirection::Debit, $fees->direction);
        $this->assertSame('5000.00', (string) $fees->amount);

        $rent = $statement->lines()->where('reference', 'LP-2026-001')->sole();
        $this->assertSame(BankStatementLineDirection::Credit, $rent->direction);
        $this->assertSame('15000.00', (string) $rent->amount);

        // Deux débits dans le fichier, huit crédits.
        $this->assertSame(2, $statement->lines()->where('direction', BankStatementLineDirection::Debit)->count());
        $this->assertSame(8, $statement->lines()->where('direction', BankStatementLineDirection::Credit)->count());
    }

    public function test_reparsing_a_statement_past_processing_is_a_no_op(): void
    {
        $statement = $this->upload($this->fixture());

        // Rejouer le job sur un relevé déjà parsé ne doit pas doubler les lignes.
        ParseBankStatementJob::dispatch($statement->id);

        $this->assertSame(10, $statement->lines()->count());
    }

    // ─── Match ───────────────────────────────────────────────────

    public function test_an_exact_reference_wins_at_confidence_95(): void
    {
        $payment = $this->leasePayment($this->agency, [
            'reference_number' => 'LP-2026-001',
            'amount' => 15000,
            'paid_at' => '2026-04-01',
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('reference', 'LP-2026-001')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Suggested, $line->match_status);
        $this->assertSame(LeasePayment::class, $line->matched_payment_type);
        $this->assertSame($payment->id, $line->matched_payment_id);
        $this->assertSame(95, $line->match_confidence);
    }

    public function test_a_date_within_two_days_scores_70_and_beyond_scores_60(): void
    {
        // Ligne « 20/04/2026,12000,Virement entrant,, » — sans référence, donc
        // la règle 1 ne peut pas s'appliquer : c'est la date qui tranche.
        $close = $this->leasePayment($this->agency, [
            'reference_number' => 'NO-MATCH-A',
            'amount' => 12000,
            'paid_at' => '2026-04-19',   // 1 jour → 70
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('label', 'Virement entrant')->sole();

        $this->assertSame($close->id, $line->matched_payment_id);
        $this->assertSame(70, $line->match_confidence);

        // Le même montant à 6 jours ne vaut plus que 60.
        $statement->lines()->delete();
        $far = $this->leasePayment($this->agency, [
            'reference_number' => 'NO-MATCH-B',
            'amount' => 21000,
            'paid_at' => '2026-04-14',
        ]);
        $farLine = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'posted_at' => '2026-04-20',
            'amount' => 21000,
            'currency' => 'XOF',
            'direction' => BankStatementLineDirection::Credit,
            'reference' => null,
            'counterparty' => null,
            'match_status' => BankStatementLineMatchStatus::Unmatched,
        ]);

        (new MatchBankStatementJob($statement->id))
            ->handle(app(ReconciliationMatcher::class));

        $farLine->refresh();
        $this->assertSame($far->id, $farLine->matched_payment_id);
        $this->assertSame(60, $farLine->match_confidence);
    }

    public function test_a_different_reference_does_not_earn_the_95(): void
    {
        // Ligne « 02/04/2026,25000,…,LP-2026-002 ». Le paiement colle par le
        // montant mais porte une AUTRE référence : la règle 1 exige l'égalité
        // des valeurs, pas la seule présence des deux champs. Sans ce cas, un
        // comparateur qui vérifierait la forme et non la valeur resterait vert.
        $payment = $this->leasePayment($this->agency, [
            'reference_number' => 'SOMETHING-ELSE',
            'amount' => 25000,
            'paid_at' => '2026-04-08',   // 6 jours → hors règle 3
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('reference', 'LP-2026-002')->sole();

        $this->assertSame($payment->id, $line->matched_payment_id);
        $this->assertSame(60, $line->match_confidence);
    }

    public function test_a_debit_line_is_never_matched(): void
    {
        // Un paiement de 5000 existe et colle par la date, mais la ligne
        // « Frais bancaires » est un DÉBIT : de l'argent qui sort ne rapproche
        // pas un encaissement.
        $this->leasePayment($this->agency, [
            'reference_number' => 'LP-FEES',
            'amount' => 5000,
            'paid_at' => '2026-04-03',
        ]);

        $statement = $this->upload($this->fixture());
        $fees = $statement->lines()->where('label', 'Frais bancaires')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $fees->match_status);
        $this->assertNull($fees->matched_payment_id);
    }

    public function test_two_equally_plausible_candidates_produce_no_suggestion(): void
    {
        // Deux paiements au même montant, tous deux hors de la fenêtre ±2 jours
        // et sans référence commune → score 60 ex æquo. Suggérer l'un des deux
        // au hasard ferait rapprocher de l'argent sur le mauvais paiement.
        foreach (['AMB-A', 'AMB-B'] as $reference) {
            $this->leasePayment($this->agency, [
                'reference_number' => $reference,
                'amount' => 12000,
                'paid_at' => '2026-04-14',
            ]);
        }

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('label', 'Virement entrant')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $line->match_status);
        $this->assertNull($line->matched_payment_id);
    }

    public function test_a_payment_of_another_agency_is_never_suggested(): void
    {
        // Fuite inter-tenant : la référence est EXACTE et le montant colle,
        // mais le paiement appartient à une autre agence.
        $other = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->leasePayment($other, [
            'reference_number' => 'LP-2026-001',
            'amount' => 15000,
            'paid_at' => '2026-04-01',
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('reference', 'LP-2026-001')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $line->match_status);
        $this->assertNull($line->matched_payment_id);
    }

    public function test_an_already_reconciled_payment_is_never_suggested_twice(): void
    {
        $this->leasePayment($this->agency, [
            'reference_number' => 'LP-2026-001',
            'amount' => 15000,
            'paid_at' => '2026-04-01',
            'bank_reconciled_at' => now(),
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('reference', 'LP-2026-001')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $line->match_status);
        $this->assertNull($line->matched_payment_id);
    }

    public function test_a_payment_in_another_currency_is_never_suggested(): void
    {
        $this->leasePayment($this->agency, [
            'reference_number' => 'LP-2026-001',
            'amount' => 15000,
            'paid_at' => '2026-04-01',
            'currency' => Currency::EUR,
        ]);

        $statement = $this->upload($this->fixture());
        $line = $statement->lines()->where('reference', 'LP-2026-001')->sole();

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $line->match_status);
        $this->assertNull($line->matched_payment_id);
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function fixture(): string
    {
        return file_get_contents(base_path('tests/fixtures/bank/sample.csv'));
    }

    /**
     * Dépose un relevé par la vraie route et rend le `BankStatement` frais.
     * La file n'est PAS fakée : `ParseBankStatementJob` puis
     * `MatchBankStatementJob` s'exécutent en ligne (`QUEUE_CONNECTION=sync`).
     */
    private function upload(string $content): BankStatement
    {
        $response = $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('statement.csv', $content),
                'source_format' => 'csv',
                'bank_name' => 'BIS',
            ]);

        $response->assertStatus(202);

        return BankStatement::findOrFail($response->json('data.id'));
    }

    /** @param array<string,mixed> $attributes */
    private function leasePayment(Agency $agency, array $attributes): LeasePayment
    {
        $lease = Lease::factory()->create(['agency_id' => $agency->id]);

        return LeasePayment::factory()->create(array_merge([
            'lease_id' => $lease->id,
            'payer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'currency' => Currency::XOF,
            'bank_reconciled_at' => null,
            'bank_statement_line_id' => null,
        ], $attributes));
    }
}
