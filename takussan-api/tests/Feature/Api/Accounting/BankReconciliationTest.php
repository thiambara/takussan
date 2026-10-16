<?php

namespace Tests\Feature\Api\Accounting;

use App\Jobs\Accounting\MatchBankStatementJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Property;
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

    public function test_la_regle_contrepartie_s_applique_aux_encaissements(): void
    {
        // TCK-706 (P25.03) — un crédit à J+5, hors de la règle « ±2 jours » : seule la règle
        // « contrepartie ≥ 85 % » peut le porter au-dessus de 60. Le matcher ne chargeait pas la
        // clé du payeur, et la relation rendait `null` sans erreur.
        $payer = Customer::factory()->create(['first_name' => 'Aïssatou', 'last_name' => 'Ndiaye']);
        $paidAt = '2026-04-10 10:00:00';

        $leasePayment = LeasePayment::factory()->paid()->create([
            'payer_id' => $payer->id, 'amount' => 150_000, 'currency' => 'XOF', 'paid_at' => $paidAt,
        ]);
        $leasePayment->lease->update(['agency_id' => $this->agency->id]);

        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $bookingPayment = BookingPayment::factory()->paid()->create([
            'booking_id' => Booking::factory()->create(['property_id' => $property->id])->id,
            'payer_id' => $payer->id, 'amount' => 160_000, 'currency' => 'XOF', 'paid_at' => $paidAt,
        ]);

        $invoice = Invoice::factory()->sent()->create([
            'agency_id' => $this->agency->id, 'customer_id' => $payer->id,
            'subtotal' => 170_000, 'tax_amount' => 0, 'total_amount' => 170_000, 'currency' => 'XOF',
            'issue_date' => '2026-04-10',
        ]);

        $cases = [
            [LeasePayment::class, $leasePayment->id, 150_000],
            [BookingPayment::class, $bookingPayment->id, 160_000],
            [Invoice::class, $invoice->id, 170_000],
        ];

        foreach ($cases as [$type, $id, $amount]) {
            $line = $this->statementLine(BankStatementLineDirection::Credit, $amount, '2026-04-15');
            $line->update(['counterparty' => 'Aïssatou Ndiaye']);

            (new MatchBankStatementJob($line->bank_statement_id))->handle(app(ReconciliationMatcher::class));

            $line->refresh();
            $this->assertSame($type, $line->matched_payment_type);
            $this->assertSame($id, $line->matched_payment_id);
            $this->assertSame(80, $line->match_confidence, "{$type} : la règle contrepartie ne s'applique pas.");
        }
    }

    public function test_une_facture_non_encaissable_n_est_ni_suggeree_ni_confirmable(): void
    {
        // TCK-724 (P25.04) — une facture brouillon, annulée ou nulle n'attend aucun encaissement :
        // le matcher la proposait à 70, et `confirmMatch()` lui posait `bank_reconciled_at`.
        $line = $this->statementLine(BankStatementLineDirection::Credit, 33_333, '2026-04-11');

        foreach ([InvoiceStatus::Draft, InvoiceStatus::Cancelled, InvoiceStatus::Void] as $status) {
            $invoice = $this->invoiceOf(33_333, $status);

            (new MatchBankStatementJob($line->bank_statement_id))->handle(app(ReconciliationMatcher::class));
            $this->assertNull($line->refresh()->matched_payment_id, "Une facture {$status->value} a été suggérée.");

            $this->actingAs($this->admin)
                ->postJson("/api/bank-statement-lines/{$line->id}/match", ['payment_type' => 'invoice', 'payment_id' => $invoice->id])
                ->assertStatus(422)
                ->assertJsonPath('errors.payment_id.0', __('reconciliation.validation.invoice_not_reconcilable'));
            $this->assertNull($invoice->refresh()->bank_reconciled_at);

            $invoice->delete();
        }
    }

    public function test_une_facture_envoyee_en_retard_ou_payee_reste_rapprochable(): void
    {
        // TCK-724 (P25.04) — le versant autorisé : `sent`, `overdue` et `paid` restent suggérés et
        // confirmables, pour qu'un filtre qui refuserait tout ne puisse pas rendre le test précédent vert.
        foreach ([InvoiceStatus::Sent, InvoiceStatus::Overdue, InvoiceStatus::Paid] as $status) {
            $invoice = $this->invoiceOf(44_444, $status);
            $line = $this->statementLine(BankStatementLineDirection::Credit, 44_444, '2026-04-11');

            (new MatchBankStatementJob($line->bank_statement_id))->handle(app(ReconciliationMatcher::class));
            $line->refresh();
            $this->assertSame([Invoice::class, $invoice->id], [$line->matched_payment_type, $line->matched_payment_id], "Une facture {$status->value} n'a pas été suggérée.");

            $this->actingAs($this->admin)
                ->postJson("/api/bank-statement-lines/{$line->id}/match", ['payment_type' => 'invoice', 'payment_id' => $invoice->id])
                ->assertOk();
            $this->assertNotNull($invoice->refresh()->bank_reconciled_at);
        }
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

    private function invoiceOf(int $total, InvoiceStatus $status): Invoice
    {
        return Invoice::factory()->create([
            'agency_id' => $this->agency->id, 'status' => $status,
            'subtotal' => $total, 'tax_amount' => 0, 'total_amount' => $total, 'currency' => 'XOF',
            'issue_date' => '2026-04-11',
        ]);
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
