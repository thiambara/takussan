<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\User;
use App\Services\Invoice\OverdueReminderService;
use App\Services\Model\InvoiceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * TCK-1524 (P110.03) — un crédit confirmé sur une facture envoyée ou en retard vaut règlement
 * (décision du porteur) : `markPaid` dans la transaction de `confirmMatch`. Avant, la facture restait
 * `sent` avec son crédit rapproché : relancée au jalon suivant, puis annulable par avoir, sa ligne
 * restant `confirmed` sur une facture `cancelled`.
 */
class ReconciledInvoiceSettlementTest extends TestCase
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

    public function test_un_credit_confirme_solde_la_facture_envoyee_qui_n_est_plus_relancee_ni_annulable(): void
    {
        $invoice = $this->invoiceOf(170_000, InvoiceStatus::Sent);
        $line = $this->credit(170_000);

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", ['payment_type' => 'invoice', 'payment_id' => $invoice->id])
            ->assertOk()
            ->assertJsonPath('data.match_status', 'confirmed');

        $invoice->refresh();
        $this->assertSame(InvoiceStatus::Paid, $invoice->status);
        $this->assertSame($line->id, $invoice->bank_statement_line_id);

        app(OverdueReminderService::class)->sendForAgency($this->agency->id, Carbon::parse('2026-07-13'));
        $invoice->refresh();
        $this->assertSame(InvoiceStatus::Paid, $invoice->status);
        $this->assertSame(0, (int) $invoice->reminders_sent_count, 'Une facture soldée par son crédit a été relancée.');

        try {
            app(InvoiceService::class)->cancel($invoice, $this->admin);
            $this->fail('Une facture soldée par son crédit rapproché a été annulée.');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        $this->assertSame(InvoiceStatus::Paid, $invoice->refresh()->status);
    }

    public function test_une_facture_en_retard_est_soldee_de_meme(): void
    {
        $invoice = $this->invoiceOf(80_000, InvoiceStatus::Overdue);
        $line = $this->credit(80_000);

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", ['payment_type' => 'invoice', 'payment_id' => $invoice->id])
            ->assertOk();

        $this->assertSame(InvoiceStatus::Paid, $invoice->refresh()->status);
    }

    public function test_une_facture_deja_payee_se_rapproche_sans_changer(): void
    {
        $invoice = $this->invoiceOf(60_000, InvoiceStatus::Paid);
        $line = $this->credit(60_000);

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", ['payment_type' => 'invoice', 'payment_id' => $invoice->id])
            ->assertOk();

        $invoice->refresh();
        $this->assertSame(InvoiceStatus::Paid, $invoice->status);
        $this->assertSame($line->id, $invoice->bank_statement_line_id);
    }

    private function invoiceOf(int $total, InvoiceStatus $status): Invoice
    {
        return Invoice::factory()->create([
            'agency_id' => $this->agency->id, 'status' => $status,
            'subtotal' => $total, 'tax_amount' => 0, 'total_amount' => $total, 'currency' => 'XOF',
            'issue_date' => '2026-06-10', 'due_date' => '2026-07-10',
        ]);
    }

    private function credit(int $amount): BankStatementLine
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        return BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'direction' => BankStatementLineDirection::Credit,
            'amount' => $amount,
            'currency' => 'XOF',
            'posted_at' => '2026-07-11',
        ]);
    }
}
