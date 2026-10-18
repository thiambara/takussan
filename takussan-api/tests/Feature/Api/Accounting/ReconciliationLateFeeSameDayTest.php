<?php

namespace Tests\Feature\Api\Accounting;

use App\Jobs\Accounting\MatchBankStatementJob;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\LeasePayment;
use App\Models\User;
use App\Services\Accounting\ReconciliationMatcher;
use App\Services\Lease\LateFeeSettlement;
use App\Services\Model\LeasePaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\LeaseDueFixture;
use Tests\TestCase;

/**
 * TCK-833 (P25.06) — une échéance soldée hors ligne, dont la pénalité est réglée le même jour,
 * est attendue sur le compte pour le loyer ET la pénalité : un virement de 157 500 (150 000 +
 * 7 500) s'y rapproche. Jusque-là, le montant attendu restait `amount`, et la ligne restait
 * `unmatched`.
 */
class ReconciliationLateFeeSameDayTest extends TestCase
{
    use LeaseDueFixture, RefreshDatabase;

    public function test_loyer_et_penalite_regles_le_meme_jour_sont_attendus_ensemble(): void
    {
        $ctx = $this->leaseDue();
        $payment = $this->solder($ctx, penaliteLeMemeJour: true);

        $line = $this->ligneRapprochee($ctx['agency'], 157_500);

        $this->assertSame(BankStatementLineMatchStatus::Suggested, $line->match_status);
        $this->assertSame(LeasePayment::class, $line->matched_payment_type);
        $this->assertSame($payment->id, $line->matched_payment_id);
        // La recherche manuelle lit la même expression.
        $this->assertSame([['lease_payment', $payment->id]], $this->recherche($ctx['agency'], 157_500));
    }

    /** Témoin : une pénalité réglée un autre jour n'entre pas dans le montant attendu du loyer. */
    public function test_une_penalite_reglee_un_autre_jour_reste_hors_du_montant_attendu(): void
    {
        $ctx = $this->leaseDue();
        $payment = $this->solder($ctx, penaliteLeMemeJour: false);

        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $this->ligneRapprochee($ctx['agency'], 157_500)->match_status);
        $this->assertSame([['lease_payment', $payment->id]], $this->recherche($ctx['agency'], 150_000));
    }

    /** Témoin : sans pénalité réglée, le montant attendu reste celui de l'échéance. */
    public function test_sans_penalite_reglee_le_montant_attendu_reste_le_loyer(): void
    {
        $ctx = $this->leaseDue();
        app(LeasePaymentService::class)->markPaid($ctx['payment'], ['payment_method' => 'bank_transfer']);

        $line = $this->ligneRapprochee($ctx['agency'], 150_000);

        $this->assertSame(BankStatementLineMatchStatus::Suggested, $line->match_status);
        $this->assertSame([], $this->recherche($ctx['agency'], 157_500));
    }

    /** @param  array{agency: Agency, payment: LeasePayment, agent: User}  $ctx */
    private function solder(array $ctx, bool $penaliteLeMemeJour): LeasePayment
    {
        app(LeasePaymentService::class)->markPaid($ctx['payment'], ['payment_method' => 'bank_transfer']);
        if (! $penaliteLeMemeJour) {
            $this->travel(2)->days();
        }
        app(LateFeeSettlement::class)->markPaid($ctx['payment']->refresh(), $ctx['agent'], ['payment_method' => 'bank_transfer']);

        return $ctx['payment']->refresh();
    }

    private function ligneRapprochee(Agency $agency, int $amount): BankStatementLine
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $agency->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);
        $line = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'direction' => BankStatementLineDirection::Credit,
            'amount' => $amount,
            'currency' => 'XOF',
            'posted_at' => now()->toDateString(),
            'reference' => null,
            'counterparty' => null,
        ]);

        (new MatchBankStatementJob($statement->id))->handle(app(ReconciliationMatcher::class));

        return $line->refresh();
    }

    /** @return list<array{0: string, 1: int}> */
    private function recherche(Agency $agency, int $amount): array
    {
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $agency->update(['primary_admin_id' => $admin->id]);

        return array_map(
            fn ($c) => [$c['type'], $c['id']],
            $this->actingAs($admin)
                ->getJson("/api/agencies/{$agency->id}/bank-statements/payment-search?amount={$amount}&direction=credit")
                ->assertOk()
                ->json('data'),
        );
    }
}
