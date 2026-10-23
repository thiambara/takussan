<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Customer;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementSourceFormat;
use App\Models\Enums\BankStatementStatus;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Accounting\MatchSuggestion;
use App\Services\Accounting\ReconciliationMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1721 (P157.07) — la règle 95 cherche aussi la référence du paiement dans le `MEMO` d'une ligne
 * OFX et dans le libellé d'une ligne CSV, là où la banque range le texte saisi par le payeur. Le
 * `FITID` reste la `reference` de la ligne, et `NAME` son libellé. La référence doit y figurer comme
 * un mot entier : `LP-77` ne s'apparie pas à un `MEMO` qui porte `LP-770`.
 *
 * Deux échéances de 150 000 payées la veille : sans la référence, les deux sont à 70 et la ligne
 * reste sans suggestion (TCK-827).
 */
class ReferenceDansLeLibelleTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private LeasePayment $lp77;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create();
        $this->agency->update(['primary_admin_id' => $this->admin->id]);

        $this->lp77 = $this->loyer('LP-77');
        $this->loyer('LP-88');
    }

    public function test_la_reference_portee_par_le_memo_ofx_gagne_le_95(): void
    {
        $suggestion = $this->suggestion($this->ligne(BankStatementSourceFormat::Ofx, 'VIR DIOP', ['MEMO' => 'LP-77', 'NAME' => 'VIR DIOP']));

        $this->assertNotNull($suggestion);
        $this->assertSame($this->lp77->id, $suggestion->paymentId);
        $this->assertSame(95, $suggestion->confidence);
    }

    public function test_la_reference_dans_le_libelle_csv_gagne_le_95(): void
    {
        $suggestion = $this->suggestion($this->ligne(BankStatementSourceFormat::Csv, 'Loyer avril lp-77 Diop'));

        $this->assertNotNull($suggestion);
        $this->assertSame($this->lp77->id, $suggestion->paymentId);
        $this->assertSame(95, $suggestion->confidence);
    }

    public function test_une_reference_qui_n_est_qu_une_partie_d_un_mot_ne_compte_pas(): void
    {
        // `LP-770` contient `LP-77` : une recherche en sous-chaîne le suggérerait à 95.
        $this->assertNull($this->suggestion($this->ligne(BankStatementSourceFormat::Ofx, 'VIR DIOP', ['MEMO' => 'LP-770', 'NAME' => 'VIR DIOP'])));
        $this->assertNull($this->suggestion($this->ligne(BankStatementSourceFormat::Csv, 'Loyer XLP-77')));
    }

    private function loyer(string $reference): LeasePayment
    {
        $paiement = LeasePayment::factory()->paid()->create([
            'payer_id' => Customer::factory()->create()->id,
            'amount' => 150_000, 'currency' => 'XOF', 'paid_at' => '2026-04-01 10:00:00', 'reference_number' => $reference,
        ]);
        $paiement->lease->update(['agency_id' => $this->agency->id]);

        return $paiement;
    }

    /** @param array<string, string> $raw */
    private function ligne(BankStatementSourceFormat $format, string $label, array $raw = []): BankStatementLine
    {
        $releve = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
            'source_format' => $format,
        ]);

        return BankStatementLine::factory()->create([
            'bank_statement_id' => $releve->id,
            'direction' => BankStatementLineDirection::Credit,
            'amount' => 150_000,
            'currency' => 'XOF',
            'posted_at' => '2026-04-02',
            'label' => $label,
            'reference' => 'BANK-9981',
            'counterparty' => null,
            'raw_payload' => $raw,
        ]);
    }

    private function suggestion(BankStatementLine $ligne): ?MatchSuggestion
    {
        return app(ReconciliationMatcher::class)->suggestFor($ligne->fresh());
    }
}
