<?php

namespace Tests\Feature\Api;

use App\Jobs\Accounting\MatchBankStatementJob;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Services\Accounting\ReconciliationMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-594 × TCK-593 — un reversement passé par les quatre yeux aboutit à l'état que le
 * rapprochement bancaire accepte.
 *
 * `ReconciliationMatcher` ne propose qu'un `Payout` `completed`, au net exact, dans la fenêtre
 * autour de `processed_at`. La machine d'état de 594 ajoute `awaiting_approval` en amont : ce test
 * suit un reversement par la vraie chaîne d'API (préparé, approuvé par une seconde personne, payé)
 * et vérifie que le débit du relevé le trouve — et qu'avant le paiement, rien ne le trouve.
 */
class PayoutReachesReconciliationTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use RefreshDatabase;

    public function test_a_payout_approved_then_paid_is_suggested_for_the_bank_debit(): void
    {
        Notification::fake();
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $issuer = $this->agencyAdmin($agency);
        $approver = $this->agencyAdmin($agency);

        Sanctum::actingAs($issuer);
        $this->patchJson("/api/agencies/{$agency->id}", ['payout_approval_threshold' => 100_000])->assertOk();
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 150_000);
        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
        ])->assertCreated()->json('data.id');
        $this->assertSame(PayoutStatus::AwaitingApproval, Payout::find($id)->status);

        $line = $this->debitLine($agency->id, $issuer->id, 150_000, '2026-10-02');

        // Non payé : le débit ne le trouve pas.
        (new MatchBankStatementJob($line->bank_statement_id))->handle(app(ReconciliationMatcher::class));
        $this->assertNull($line->refresh()->matched_payment_id);

        Sanctum::actingAs($approver);
        $this->postJson("/api/payouts/{$id}/approve")->assertOk();

        Sanctum::actingAs($issuer);
        $this->postJson("/api/payouts/{$id}/mark-processed", [
            'payment_method' => 'check',
            'transaction_id' => 'CHQ-0042',
            'processed_at' => '2026-10-01 15:00:00',
        ])->assertOk();
        $this->assertSame(PayoutStatus::Completed, Payout::find($id)->status);

        (new MatchBankStatementJob($line->bank_statement_id))->handle(app(ReconciliationMatcher::class));

        $line->refresh();
        $this->assertSame(BankStatementLineMatchStatus::Suggested, $line->match_status);
        $this->assertSame(Payout::class, $line->matched_payment_type);
        $this->assertSame($id, $line->matched_payment_id);
    }

    private function debitLine(int $agencyId, int $uploaderId, int $amount, string $postedAt): BankStatementLine
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $agencyId,
            'uploaded_by' => $uploaderId,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        return BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'direction' => BankStatementLineDirection::Debit,
            'amount' => $amount,
            'currency' => 'XOF',
            'posted_at' => $postedAt,
            'reference' => null,
            'counterparty' => null,
        ]);
    }
}
