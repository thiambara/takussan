<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Accounting\ReconciliationManager;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-828 (P25.07) — une confirmation de rapprochement journalise le statut de l'encaissement et
 * l'écart entre la ligne et le montant attendu. Le comportement ne change pas : la confirmation
 * d'une ligne de 7 500 sur une échéance en attente de 150 000 passe toujours, mais elle se lit.
 */
class ReconciliationConfirmationAuditTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create();
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
    }

    public function test_une_ligne_partielle_sur_une_echeance_en_attente_journalise_statut_et_ecart(): void
    {
        $echeance = $this->echeance(150_000, PaymentStatus::Pending);

        $proprietes = $this->confirmer($this->ligne(7_500), $echeance);

        $this->assertSame('pending', $proprietes['payment_status']);
        $this->assertEquals(150_000, $proprietes['expected_amount']);
        $this->assertEquals(-142_500, $proprietes['amount_gap']);
    }

    /** Une échéance soldée en ligne pénalité comprise attend 157 500, pas son `amount` (TCK-715). */
    public function test_l_ecart_d_une_echeance_payee_en_ligne_se_mesure_au_montant_fige(): void
    {
        $echeance = $this->echeance(150_000, PaymentStatus::Paid, [
            'gateway' => ['settled_by' => 'txn_1'], 'gateway_expected_amount' => 157_500,
        ]);

        $proprietes = $this->confirmer($this->ligne(157_500), $echeance);

        $this->assertSame('paid', $proprietes['payment_status']);
        $this->assertEquals(157_500, $proprietes['expected_amount']);
        $this->assertEquals(0, $proprietes['amount_gap']);
    }

    public function test_une_facture_journalise_son_statut_et_son_ecart(): void
    {
        $facture = Invoice::factory()->create([
            'agency_id' => $this->agency->id, 'status' => InvoiceStatus::Sent,
            'subtotal' => 170_000, 'tax_amount' => 0, 'total_amount' => 170_000, 'currency' => 'XOF',
            'issue_date' => '2026-04-11',
        ]);

        $proprietes = $this->confirmer($this->ligne(170_000), $facture);

        $this->assertSame('sent', $proprietes['payment_status']);
        $this->assertEquals(0, $proprietes['amount_gap']);
    }

    /** @param  array<string, mixed>  $metadata */
    private function echeance(int $montant, PaymentStatus $statut, array $metadata = []): LeasePayment
    {
        $echeance = LeasePayment::factory()->create([
            'amount' => $montant, 'currency' => 'XOF', 'status' => $statut, 'metadata' => $metadata,
            'bank_reconciled_at' => null, 'bank_statement_line_id' => null,
        ]);
        $echeance->lease->update(['agency_id' => $this->agency->id]);

        return $echeance;
    }

    private function ligne(int $montant): BankStatementLine
    {
        $releve = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        return BankStatementLine::factory()->create([
            'bank_statement_id' => $releve->id,
            'direction' => BankStatementLineDirection::Credit,
            'amount' => $montant,
            'currency' => 'XOF',
            'posted_at' => '2026-04-12',
        ]);
    }

    /** @return array<string, mixed> */
    private function confirmer(BankStatementLine $ligne, Model $paiement): array
    {
        app(ReconciliationManager::class)->confirmMatch($ligne, $paiement, $this->admin);

        $activite = Activity::query()->where('log_name', 'BankStatementLine')->where('event', 'matched')
            ->where('subject_id', $ligne->id)->sole();

        return $activite->properties->all();
    }
}
