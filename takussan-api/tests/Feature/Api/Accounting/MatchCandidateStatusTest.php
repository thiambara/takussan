<?php

namespace Tests\Feature\Api\Accounting;

use App\Jobs\Accounting\MatchBankStatementJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use App\Models\Property;
use App\Models\User;
use App\Services\Accounting\ReconciliationMatcher;
use App\Services\Model\BookingPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1526 (P110.04) — un payable déjà remboursé reste proposé, et c'est voulu : le crédit a pu
 * arriver. Ce qui manquait est de le dire. La recherche manuelle rend le statut de chaque candidat
 * (`status`), et la suggestion le rend par sa ligne (`matched_payment_status`, TCK-1522). Rien
 * n'est écarté ni refusé (décision du porteur).
 */
class MatchCandidateStatusTest extends TestCase
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

    public function test_la_recherche_manuelle_rend_le_statut_de_chaque_candidat_sans_ecarter_le_rembourse(): void
    {
        $acompte = $this->acompteRembourse(70_000, 'CAND-ACOMPTE');
        $facture = Invoice::factory()->create([
            'agency_id' => $this->agency->id, 'status' => InvoiceStatus::Sent, 'reference_number' => 'CAND-FACTURE',
            'subtotal' => 70_000, 'tax_amount' => 0, 'total_amount' => 70_000, 'currency' => 'XOF',
            'issue_date' => '2026-04-11',
        ]);

        $candidats = collect($this->actingAs($this->admin)
            ->getJson("/api/agencies/{$this->agency->id}/bank-statements/payment-search?q=CAND-&direction=credit")
            ->assertOk()
            ->json('data'))
            ->keyBy(fn (array $c) => "{$c['type']}#{$c['id']}");

        $this->assertSame('refunded', $candidats["booking_payment#{$acompte->id}"]['status'] ?? null);
        $this->assertSame('sent', $candidats["invoice#{$facture->id}"]['status'] ?? null);
    }

    public function test_la_suggestion_sur_un_acompte_rembourse_dit_son_statut(): void
    {
        $acompte = $this->acompteRembourse(70_000, 'SUGG-ACOMPTE');

        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);
        BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'direction' => BankStatementLineDirection::Credit,
            'amount' => 70_000,
            'currency' => 'XOF',
            'posted_at' => '2026-04-11',
            'reference' => null,
            'counterparty' => null,
        ]);

        (new MatchBankStatementJob($statement->id))->handle(app(ReconciliationMatcher::class));

        $this->actingAs($this->admin)
            ->getJson("/api/bank-statements/{$statement->id}/lines")
            ->assertOk()
            ->assertJsonPath('data.0.match_status', 'suggested')
            ->assertJsonPath('data.0.matched_payment_type', 'booking_payment')
            ->assertJsonPath('data.0.matched_payment_id', $acompte->id)
            ->assertJsonPath('data.0.matched_payment_status', 'refunded');
    }

    private function acompteRembourse(int $amount, string $reference): BookingPayment
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $payment = BookingPayment::factory()->paid()->create([
            'booking_id' => Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $this->agency->id])->id,
            'reference_number' => $reference,
            'amount' => $amount,
            'currency' => 'XOF',
            'paid_at' => '2026-04-10',
        ]);

        return app(BookingPaymentService::class)->refund($payment, ['refund_amount' => $amount]);
    }
}
