<?php

namespace Tests\Feature\Api\Accounting;

use App\Jobs\Accounting\MatchBankStatementJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\User;
use App\Services\Accounting\ReconciliationMatcher;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

class BankReconciliationTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    protected Agency $agency;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create([
            'agency_id' => $this->agency->id,
        ]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
    }

    // ─── Upload / Import ─────────────────────────────────────────

    public function test_upload_bank_statement_returns_202(): void
    {
        Queue::fake();

        $file = UploadedFile::fake()->createWithContent('statement.csv', file_get_contents(
            base_path('tests/fixtures/bank/sample.csv')
        ));

        $response = $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => $file,
                'source_format' => 'csv',
                'bank_name' => 'BIS',
            ]);

        $response->assertStatus(202);
        $response->assertJsonPath('data.status', 'processing');
        $response->assertJsonPath('data.agency_id', $this->agency->id);

        $this->assertDatabaseHas('bank_statements', [
            'agency_id' => $this->agency->id,
            'source_format' => 'csv',
            'status' => 'processing',
            'bank_name' => 'BIS',
        ]);
    }

    public function test_duplicate_upload_is_rejected(): void
    {
        Queue::fake();

        $content = file_get_contents(base_path('tests/fixtures/bank/sample.csv'));

        // Upload once
        $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('s1.csv', $content),
                'source_format' => 'csv',
            ]);

        // Upload again — same content
        $response = $this->actingAs($this->admin)
            ->postJson("/api/agencies/{$this->agency->id}/bank-statements", [
                'file' => UploadedFile::fake()->createWithContent('s2.csv', $content),
                'source_format' => 'csv',
            ]);

        $response->assertStatus(422);
    }

    // ─── List & Show ─────────────────────────────────────────────

    public function test_list_bank_statements(): void
    {
        BankStatement::factory()->count(3)->create(['agency_id' => $this->agency->id, 'uploaded_by' => $this->admin->id]);

        $response = $this->actingAs($this->admin)
            ->getJson("/api/agencies/{$this->agency->id}/bank-statements");

        $response->assertOk();
        $response->assertJsonCount(3, 'data');
    }

    public function test_show_bank_statement(): void
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
        ]);

        $response = $this->actingAs($this->admin)
            ->getJson("/api/bank-statements/{$statement->id}");

        $response->assertOk();
        $response->assertJsonPath('data.id', $statement->id);
    }

    // ─── Line Actions ────────────────────────────────────────────

    public function test_confirm_match_on_line(): void
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        $line = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'amount' => 15000,
            'currency' => 'XOF',
            'match_status' => BankStatementLineMatchStatus::Suggested,
        ]);

        $payment = LeasePayment::factory()->create([
            'amount' => 15000,
            'currency' => 'XOF',
            'bank_reconciled_at' => null,
            'bank_statement_line_id' => null,
        ]);

        // Attach the payment's lease to the agency
        $payment->lease->update(['agency_id' => $this->agency->id]);

        $response = $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'lease_payment',
                'payment_id' => $payment->id,
            ]);

        $response->assertOk();
        $response->assertJsonPath('data.match_status', 'confirmed');

        $this->assertDatabaseHas('lease_payments', [
            'id' => $payment->id,
            'bank_statement_line_id' => $line->id,
        ]);
    }

    public function test_ignore_line(): void
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        $line = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'match_status' => BankStatementLineMatchStatus::Unmatched,
        ]);

        $response = $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/ignore");

        $response->assertOk();
        $response->assertJsonPath('data.match_status', 'ignored');
    }

    // ─── TCK-593 — les reversements, et le montant figé ─────────

    public function test_un_debit_est_suggere_sur_le_reversement_emis(): void
    {
        // AC14 — un débit de 285 000 à J+1 d'un reversement `completed` de net 285 000.
        $payout = $this->completedPayout($this->agency, 285_000, '2026-04-10 15:00:00');
        $line = $this->statementLine(BankStatementLineDirection::Debit, 285_000, '2026-04-11');

        (new MatchBankStatementJob($line->bank_statement_id))->handle(app(ReconciliationMatcher::class));

        $line->refresh();
        $this->assertSame(BankStatementLineMatchStatus::Suggested, $line->match_status);
        $this->assertSame(Payout::class, $line->matched_payment_type);
        $this->assertSame($payout->id, $line->matched_payment_id);
        $this->assertGreaterThanOrEqual(70, $line->match_confidence);

        $this->actingAs($this->admin)
            ->getJson("/api/bank-statements/{$line->bank_statement_id}/lines")
            ->assertOk()
            ->assertJsonPath('data.0.matched_payment_type', 'payout');

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'payout',
                'payment_id' => $payout->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.match_status', 'confirmed');

        $payout->refresh();
        $this->assertSame('2026-04-11', $payout->bank_reconciled_at->toDateString());
        $this->assertSame($line->id, $payout->bank_statement_line_id);
    }

    public function test_un_reversement_n_est_rapproche_qu_une_fois(): void
    {
        $payout = $this->completedPayout($this->agency, 285_000, '2026-04-10 15:00:00');
        $first = $this->statementLine(BankStatementLineDirection::Debit, 285_000, '2026-04-11');
        $second = $this->statementLine(BankStatementLineDirection::Debit, 285_000, '2026-04-12', $first->bank_statement_id);

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$first->id}/match", ['payment_type' => 'payout', 'payment_id' => $payout->id])
            ->assertOk();

        // Déjà rapproché : ni suggéré à la seconde ligne, ni confirmable sur elle.
        (new MatchBankStatementJob($second->bank_statement_id))->handle(app(ReconciliationMatcher::class));
        $this->assertNull($second->refresh()->matched_payment_id);

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$second->id}/match", ['payment_type' => 'payout', 'payment_id' => $payout->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payment');

        // Et l'index unique partiel le garantit sous la garde applicative.
        $this->expectException(UniqueConstraintViolationException::class);
        Payout::factory()->completed()->create([
            'agency_id' => $this->agency->id,
            'bank_statement_line_id' => $first->id,
        ]);
    }

    public function test_un_credit_ne_s_apparie_pas_a_un_reversement(): void
    {
        // AC15 — un crédit du même montant, le même jour : ce n'est pas un reversement.
        $payout = $this->completedPayout($this->agency, 285_000, '2026-04-10 15:00:00');
        $credit = $this->statementLine(BankStatementLineDirection::Credit, 285_000, '2026-04-11');

        (new MatchBankStatementJob($credit->bank_statement_id))->handle(app(ReconciliationMatcher::class));
        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $credit->refresh()->match_status);

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$credit->id}/match", ['payment_type' => 'payout', 'payment_id' => $payout->id])
            ->assertStatus(422)
            ->assertJsonPath('errors.payment_type.0', __('reconciliation.validation.direction_mismatch'));
        $this->assertNull($payout->refresh()->bank_statement_line_id);

        // Et un débit ne se confirme pas sur un encaissement.
        $debit = $this->statementLine(BankStatementLineDirection::Debit, 15_000, '2026-04-11', $credit->bank_statement_id);
        $payment = LeasePayment::factory()->create(['amount' => 15_000, 'currency' => 'XOF']);
        $payment->lease->update(['agency_id' => $this->agency->id]);

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$debit->id}/match", ['payment_type' => 'lease_payment', 'payment_id' => $payment->id])
            ->assertStatus(422)
            ->assertJsonPath('errors.payment_type.0', __('reconciliation.validation.direction_mismatch'));
        $this->assertNull($payment->refresh()->bank_statement_line_id);
    }

    public function test_un_reversement_non_emis_n_est_ni_suggere_ni_confirmable(): void
    {
        // Vérification adverse R9 — `pending`, `failed`, `cancelled` : ni suggérés, ni confirmés.
        $line = $this->statementLine(BankStatementLineDirection::Debit, 285_000, '2026-04-11');

        foreach ([PayoutStatus::Pending, PayoutStatus::Failed, PayoutStatus::Cancelled] as $status) {
            $payout = Payout::factory()->create([
                'agency_id' => $this->agency->id,
                'status' => $status,
                'net_amount' => 285_000,
                'currency' => 'XOF',
                'processed_at' => '2026-04-10 15:00:00',
            ]);

            (new MatchBankStatementJob($line->bank_statement_id))->handle(app(ReconciliationMatcher::class));
            $this->assertNull($line->refresh()->matched_payment_id, "Un reversement {$status->value} a été suggéré.");

            $this->actingAs($this->admin)
                ->postJson("/api/bank-statement-lines/{$line->id}/match", ['payment_type' => 'payout', 'payment_id' => $payout->id])
                ->assertStatus(422)
                ->assertJsonPath('errors.payment_id.0', __('reconciliation.validation.payout_not_completed'));
            $this->assertNull($payout->refresh()->bank_reconciled_at);
        }
    }

    public function test_un_reversement_hors_fenetre_n_est_pas_suggere(): void
    {
        // R9 — 8 jours avant le débit : hors de la fenêtre de ±7 jours sur `processed_at`.
        $this->completedPayout($this->agency, 285_000, '2026-04-03 15:00:00');
        $line = $this->statementLine(BankStatementLineDirection::Debit, 285_000, '2026-04-11');

        (new MatchBankStatementJob($line->bank_statement_id))->handle(app(ReconciliationMatcher::class));

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $line->refresh()->match_status);
    }

    public function test_la_recherche_manuelle_suit_le_sens_de_la_ligne(): void
    {
        $payout = $this->completedPayout($this->agency, 285_000, '2026-04-10 15:00:00');
        $payment = LeasePayment::factory()->create(['amount' => 285_000, 'currency' => 'XOF']);
        $payment->lease->update(['agency_id' => $this->agency->id]);

        $search = fn (string $direction) => $this->actingAs($this->admin)
            ->getJson("/api/agencies/{$this->agency->id}/bank-statements/payment-search?amount=285000&direction={$direction}")
            ->assertOk()
            ->json('data');

        $this->assertSame([['payout', $payout->id]], array_map(fn ($c) => [$c['type'], $c['id']], $search('debit')));
        $this->assertSame([['lease_payment', $payment->id]], array_map(fn ($c) => [$c['type'], $c['id']], $search('credit')));
    }

    public function test_un_credit_penalite_incluse_est_suggere_sur_l_echeance(): void
    {
        // AC14 — l'échéance de l'AC6 : réglage activé, payée en ligne 157 500 (150 000 + 7 500).
        // Le crédit arrive pour 157 500 ; le matcher comparait `amount` (150 000) et ne la
        // retrouvait plus.
        $ctx = $this->leaseDue(['late_fee_online_collection' => true]);
        $this->spyDriver();
        Sanctum::actingAs($ctx['tenant']);
        $this->postJson("/api/lease-payments/{$ctx['payment']->id}/initiate", ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', 157_500)->assertOk();

        $payment = $ctx['payment']->refresh();
        $this->assertSame(PaymentStatus::Paid, $payment->status);
        $this->assertEquals(150_000, $payment->amount);

        $statement = BankStatement::factory()->create([
            'agency_id' => $ctx['agency']->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);
        $line = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'direction' => BankStatementLineDirection::Credit,
            'amount' => 157_500,
            'currency' => 'XOF',
            'posted_at' => now()->addDay()->toDateString(),
            'reference' => null,
            'counterparty' => null,
        ]);

        (new MatchBankStatementJob($statement->id))->handle(app(ReconciliationMatcher::class));

        $line->refresh();
        $this->assertSame(BankStatementLineMatchStatus::Suggested, $line->match_status);
        $this->assertSame(LeasePayment::class, $line->matched_payment_type);
        $this->assertSame($payment->id, $line->matched_payment_id);
    }

    // ─── Finalize ────────────────────────────────────────────────

    public function test_finalize_statement(): void
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        // All lines confirmed
        BankStatementLine::factory()->count(3)->create([
            'bank_statement_id' => $statement->id,
            'match_status' => BankStatementLineMatchStatus::Confirmed,
        ]);

        $response = $this->actingAs($this->admin)
            ->postJson("/api/bank-statements/{$statement->id}/finalize");

        $response->assertOk();
        $response->assertJsonPath('data.status', 'reconciled');
    }

    public function test_finalize_with_remaining_lines_gives_partial(): void
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'match_status' => BankStatementLineMatchStatus::Confirmed,
        ]);
        BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'match_status' => BankStatementLineMatchStatus::Unmatched,
        ]);

        $response = $this->actingAs($this->admin)
            ->postJson("/api/bank-statements/{$statement->id}/finalize");

        $response->assertOk();
        $response->assertJsonPath('data.status', 'partially_reconciled');
    }

    private function completedPayout(Agency $agency, int $net, string $processedAt): Payout
    {
        return Payout::factory()->completed()->create([
            'agency_id' => $agency->id,
            'gross_amount' => $net,
            'commission_amount' => 0,
            'net_amount' => $net,
            'currency' => 'XOF',
            'processed_at' => $processedAt,
        ]);
    }

    private function statementLine(BankStatementLineDirection $direction, int $amount, string $postedAt, ?int $statementId = null): BankStatementLine
    {
        $statementId ??= BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ])->id;

        return BankStatementLine::factory()->create([
            'bank_statement_id' => $statementId,
            'direction' => $direction,
            'amount' => $amount,
            'currency' => 'XOF',
            'posted_at' => $postedAt,
            'reference' => null,
            'counterparty' => null,
        ]);
    }
}
