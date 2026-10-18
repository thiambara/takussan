<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Customer;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementStatus;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Accounting\MatchSuggestion;
use App\Services\Accounting\ReconciliationMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-827 (P25.05) — deux encaissements à égalité au meilleur score : le matcher ne suggère rien,
 * quel que soit le palier. Jusque-là, l'ambiguïté n'était jugée qu'à 60, et à 70, 80 ou 95 le
 * premier candidat rencontré l'emportait.
 */
class ReconciliationAmbiguityTest extends TestCase
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

    public function test_deux_loyers_payes_le_meme_jour_au_palier_70_ne_suggerent_rien(): void
    {
        $this->loyer('2026-04-10 10:00:00');
        $this->loyer('2026-04-10 11:00:00');

        $this->assertNull($this->suggestion($this->ligne('2026-04-11')));
    }

    public function test_deux_loyers_du_meme_payeur_au_palier_80_ne_suggerent_rien(): void
    {
        $payeur = Customer::factory()->create(['first_name' => 'Aïssatou', 'last_name' => 'Ndiaye']);
        $this->loyer('2026-04-10 10:00:00', $payeur);
        $this->loyer('2026-04-10 10:00:00', $payeur);

        $this->assertNull($this->suggestion($this->ligne('2026-04-15', counterparty: 'Aïssatou Ndiaye')));
    }

    public function test_deux_loyers_de_meme_reference_au_palier_95_ne_suggerent_rien(): void
    {
        $this->loyer('2026-04-10 10:00:00', reference: 'VIR-0410');
        $this->loyer('2026-04-12 10:00:00', reference: 'VIR-0410');

        $this->assertNull($this->suggestion($this->ligne('2026-04-11', reference: 'VIR-0410')));
    }

    /** Témoin : un seul candidat au meilleur score l'emporte, même si d'autres sont en dessous. */
    public function test_un_seul_candidat_au_meilleur_score_reste_suggere(): void
    {
        $proche = $this->loyer('2026-04-10 10:00:00');
        $this->loyer('2026-04-05 10:00:00');

        $suggestion = $this->suggestion($this->ligne('2026-04-11'));

        $this->assertNotNull($suggestion);
        $this->assertSame($proche->id, $suggestion->paymentId);
        $this->assertSame(70, $suggestion->confidence);
    }

    private function loyer(string $paidAt, ?Customer $payeur = null, ?string $reference = null): LeasePayment
    {
        $paiement = LeasePayment::factory()->paid()->create([
            'payer_id' => ($payeur ?? Customer::factory()->create())->id,
            'amount' => 150_000, 'currency' => 'XOF', 'paid_at' => $paidAt, 'reference_number' => $reference,
        ]);
        $paiement->lease->update(['agency_id' => $this->agency->id]);

        return $paiement;
    }

    private function ligne(string $postedAt, ?string $counterparty = null, ?string $reference = null): BankStatementLine
    {
        $releve = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        return BankStatementLine::factory()->create([
            'bank_statement_id' => $releve->id,
            'direction' => BankStatementLineDirection::Credit,
            'amount' => 150_000,
            'currency' => 'XOF',
            'posted_at' => $postedAt,
            'reference' => $reference,
            'counterparty' => $counterparty,
        ]);
    }

    private function suggestion(BankStatementLine $ligne): ?MatchSuggestion
    {
        return app(ReconciliationMatcher::class)->suggestFor($ligne->fresh());
    }
}
