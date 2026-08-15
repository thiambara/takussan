<?php

namespace Tests\Feature\Api\Accounting;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Customer;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\Currency;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-285 — Annuler un rapprochement : `DELETE /api/bank-statement-lines/{line}/match`.
 *
 * Le mot « unmatch » n'apparaissait NULLE PART dans `tests/` :
 * `ReconciliationManager::unmatch` était à 0/26 lignes et
 * `BankStatementLinePolicy::unmatch` à 0/1. C'est pourtant le seul chemin
 * qui DÉFAIT un rapprochement d'argent — celui qu'on emprunte justement
 * quand on s'est trompé, donc celui qui doit marcher le jour où tout va mal.
 */
class BankReconciliationUnmatchTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
    }

    public function test_unmatching_frees_the_payment_and_resets_the_line(): void
    {
        [$line, $payment] = $this->confirmedPair();

        $this->actingAs($this->admin)
            ->deleteJson("/api/bank-statement-lines/{$line->id}/match")
            ->assertOk()
            ->assertJsonPath('data.match_status', 'unmatched');

        // Le paiement redevient rapprochable — les DEUX colonnes sont remises
        // à null. N'en remettre qu'une laisserait un paiement invisible pour
        // le matcher (`whereNull('bank_reconciled_at')`) mais toujours lié.
        $payment->refresh();
        $this->assertNull($payment->bank_reconciled_at);
        $this->assertNull($payment->bank_statement_line_id);

        // La ligne est intégralement remise à zéro, traçabilité comprise.
        $line->refresh();
        $this->assertSame(BankStatementLineMatchStatus::Unmatched, $line->match_status);
        $this->assertNull($line->matched_payment_type);
        $this->assertNull($line->matched_payment_id);
        $this->assertNull($line->confirmed_at);
        $this->assertNull($line->confirmed_by);
    }

    public function test_the_freed_payment_can_be_matched_again(): void
    {
        // La preuve que « libéré » veut bien dire libéré : sans la remise à
        // null de `bank_statement_line_id`, le second rapprochement heurterait
        // la garde `already_reconciled` de `confirmMatch`.
        [$line, $payment] = $this->confirmedPair();

        $this->actingAs($this->admin)
            ->deleteJson("/api/bank-statement-lines/{$line->id}/match")
            ->assertOk();

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'lease_payment',
                'payment_id' => $payment->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.match_status', 'confirmed');

        $this->assertSame($line->id, $payment->refresh()->bank_statement_line_id);
    }

    public function test_unmatching_a_line_that_was_never_matched_is_harmless(): void
    {
        $statement = $this->statement();
        $line = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'match_status' => BankStatementLineMatchStatus::Unmatched,
            'matched_payment_type' => null,
            'matched_payment_id' => null,
        ]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/bank-statement-lines/{$line->id}/match")
            ->assertOk()
            ->assertJsonPath('data.match_status', 'unmatched');
    }

    public function test_unmatching_is_refused_once_the_statement_is_closed(): void
    {
        // Un relevé clôturé est une pièce comptable arrêtée : on n'y défait
        // plus rien. NOTE — le refus vient de `BankStatementLinePolicy::unmatch`
        // (403), qui teste `isClosed()` AVANT que la requête n'atteigne
        // `ReconciliationManager::unmatch` : la garde `statement_closed` du
        // service (422) est donc inatteignable par HTTP. Les deux existent,
        // seule la première s'exerce ici.
        [$line, $payment] = $this->confirmedPair();
        $line->statement->update(['status' => BankStatementStatus::Reconciled]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/bank-statement-lines/{$line->id}/match")
            ->assertForbidden();

        // Le rapprochement tient toujours.
        $this->assertSame($line->id, $payment->refresh()->bank_statement_line_id);
        $this->assertNotNull($payment->bank_reconciled_at);
        $this->assertSame(
            BankStatementLineMatchStatus::Confirmed,
            $line->refresh()->match_status,
        );
    }

    public function test_unmatching_is_refused_on_an_archived_statement(): void
    {
        [$line, $payment] = $this->confirmedPair();
        $line->statement->update(['status' => BankStatementStatus::Archived]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/bank-statement-lines/{$line->id}/match")
            ->assertForbidden();

        $this->assertSame($line->id, $payment->refresh()->bank_statement_line_id);
    }

    public function test_a_partially_reconciled_statement_can_still_be_unmatched(): void
    {
        // Le témoin : `partially_reconciled` n'est PAS clos. Sans ce cas, un
        // refus systématique passerait pour la garde ci-dessus.
        [$line, $payment] = $this->confirmedPair();
        $line->statement->update(['status' => BankStatementStatus::PartiallyReconciled]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/bank-statement-lines/{$line->id}/match")
            ->assertOk();

        $this->assertNull($payment->refresh()->bank_statement_line_id);
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private function statement(): BankStatement
    {
        return BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);
    }

    /**
     * Une ligne CONFIRMÉE sur un paiement de l'agence, construite par la vraie
     * route de rapprochement — pas par un `update()` de factory : on veut le
     * même état que celui que la production produit.
     *
     * @return array{0: BankStatementLine, 1: LeasePayment}
     */
    private function confirmedPair(): array
    {
        $statement = $this->statement();

        $line = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'amount' => 15000,
            'currency' => 'XOF',
            'match_status' => BankStatementLineMatchStatus::Suggested,
        ]);

        $lease = Lease::factory()->create(['agency_id' => $this->agency->id]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
            'amount' => 15000,
            'currency' => Currency::XOF,
            'bank_reconciled_at' => null,
            'bank_statement_line_id' => null,
        ]);

        $this->actingAs($this->admin)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'lease_payment',
                'payment_id' => $payment->id,
            ])
            ->assertOk();

        return [$line->refresh(), $payment->refresh()];
    }
}
