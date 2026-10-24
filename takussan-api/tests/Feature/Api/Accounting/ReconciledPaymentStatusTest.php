<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Property;
use App\Models\User;
use App\Services\Model\BookingPaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-1522 (P110.02) — un encaissement rapproché puis remboursé garde son rapprochement : le crédit
 * a bien eu lieu, et la ligne n'a pas à être défaite. Ce qui manquait est le signal : la ligne
 * rendait « type #id », sans le statut du payable. Elle le rend désormais (`matched_payment_status`),
 * relu à chaque lecture, sans refuser le remboursement (décision du porteur : signaler).
 */
class ReconciledPaymentStatusTest extends TestCase
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

    public function test_la_ligne_rapprochee_dit_que_l_encaissement_a_ete_rembourse(): void
    {
        [$line, $payment] = $this->creditEtAcompte(100_000);

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'booking_payment',
                'payment_id' => $payment->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.matched_payment_status', 'paid');

        app(BookingPaymentService::class)->refund($payment, ['refund_amount' => 100_000]);

        $this->assertNotNull($payment->refresh()->bank_reconciled_at, 'Le remboursement ne défait pas le rapprochement.');

        $this->actingAs($this->admin)
            ->getJson("/api/bank-statements/{$line->bank_statement_id}/lines?fields[bank_statement_lines]=id,match_status,matched_payment_type,matched_payment_id")
            ->assertOk()
            ->assertJsonPath('data.0.match_status', 'confirmed')
            ->assertJsonPath('data.0.matched_payment_type', 'booking_payment')
            ->assertJsonPath('data.0.matched_payment_status', 'refunded');
    }

    public function test_une_ligne_sans_payable_rend_un_statut_nul(): void
    {
        [$line] = $this->creditEtAcompte(50_000);

        $this->actingAs($this->admin)
            ->getJson("/api/bank-statements/{$line->bank_statement_id}/lines")
            ->assertOk()
            ->assertJsonPath('data.0.match_status', 'unmatched')
            ->assertJsonStructure(['data' => [['matched_payment_status']]])
            ->assertJsonPath('data.0.matched_payment_status', null);
    }

    /** @return array{0: BankStatementLine, 1: BookingPayment} */
    private function creditEtAcompte(int $amount): array
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        $line = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'direction' => BankStatementLineDirection::Credit,
            'amount' => $amount,
            'currency' => 'XOF',
            'posted_at' => '2026-04-11',
            'match_status' => BankStatementLineMatchStatus::Unmatched,
            'matched_payment_type' => null,
            'matched_payment_id' => null,
        ]);

        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $payment = BookingPayment::factory()->paid()->create([
            'booking_id' => Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $this->agency->id])->id,
            'amount' => $amount,
            'currency' => 'XOF',
            'paid_at' => '2026-04-10',
        ]);

        return [$line, $payment];
    }
}
