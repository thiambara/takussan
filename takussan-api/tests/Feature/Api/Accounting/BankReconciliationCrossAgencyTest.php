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
 * TCK-285 — L'agence est la frontière d'isolation (règle n°2 du CLAUDE.md),
 * et le rapprochement bancaire est l'endroit où la franchir déplace de
 * l'argent d'un tenant vers un autre.
 *
 * `BankReconciliationTest` ne contient AUCUN `assertForbidden` ni
 * `assertStatus(403)` : la garde inter-agence de `ReconciliationManager`
 * (lignes 45-47, `abort(403, cross_agency)`) n'était jamais atteinte, et
 * `BankStatementLinePolicy::match` n'avait aucun cas refusé.
 *
 * Deux frontières distinctes sont éprouvées ici, et elles ne se remplacent
 * pas l'une l'autre :
 *   1. la POLICY  — l'appelant n'a rien à faire sur cette LIGNE ;
 *   2. le SERVICE — l'appelant est légitime sur la ligne, mais le PAIEMENT
 *      qu'il désigne appartient à une autre agence.
 */
class BankReconciliationCrossAgencyTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agencyA;

    private Agency $agencyB;

    private User $adminA;

    private User $adminB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agencyA = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->adminA = User::factory()->create(['agency_id' => $this->agencyA->id]);
        $this->agencyA->update(['primary_admin_id' => $this->adminA->id]);

        $this->agencyB = Agency::factory()->create(['currency' => Currency::XOF]);
        $this->adminB = User::factory()->create(['agency_id' => $this->agencyB->id]);
        $this->agencyB->update(['primary_admin_id' => $this->adminB->id]);
    }

    // ─── 1. La policy : la ligne d'une autre agence ──────────────

    public function test_the_admin_of_another_agency_cannot_match_a_line(): void
    {
        // Le paiement désigné appartient à l'agence A, comme la ligne : la
        // garde inter-agence du SERVICE ne se déclenche donc pas, et c'est
        // bien la policy qui doit refuser. Mesuré par ablation : viser un
        // paiement de B ferait passer ce test même policy débranchée, parce
        // que `ReconciliationManager` l'arrêterait un cran plus bas.
        $line = $this->lineOf($this->agencyA);
        $payment = $this->paymentOf($this->agencyA, 15000);

        $this->actingAs($this->adminB)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'lease_payment',
                'payment_id' => $payment->id,
            ])
            ->assertForbidden();

        // Rien n'a bougé : ni la ligne, ni le paiement. La ligne reste dans
        // son état d'origine (`suggested`), elle ne bascule pas `confirmed`.
        $this->assertSame(
            BankStatementLineMatchStatus::Suggested,
            $line->refresh()->match_status,
        );
        $this->assertNull($payment->refresh()->bank_statement_line_id);
    }

    public function test_the_admin_of_another_agency_cannot_unmatch_a_line(): void
    {
        $payment = $this->paymentOf($this->agencyA, 15000);
        $line = $this->lineOf($this->agencyA, [
            'match_status' => BankStatementLineMatchStatus::Confirmed,
            'matched_payment_type' => LeasePayment::class,
            'matched_payment_id' => $payment->id,
        ]);
        $payment->update(['bank_statement_line_id' => $line->id, 'bank_reconciled_at' => now()]);

        $this->actingAs($this->adminB)
            ->deleteJson("/api/bank-statement-lines/{$line->id}/match")
            ->assertForbidden();

        $this->assertSame($line->id, $payment->refresh()->bank_statement_line_id);
    }

    public function test_the_admin_of_another_agency_cannot_ignore_a_line(): void
    {
        $line = $this->lineOf($this->agencyA);

        $this->actingAs($this->adminB)
            ->postJson("/api/bank-statement-lines/{$line->id}/ignore")
            ->assertForbidden();

        $this->assertSame(
            BankStatementLineMatchStatus::Suggested,
            $line->refresh()->match_status,
        );
    }

    public function test_the_admin_of_another_agency_cannot_list_the_lines_of_a_statement(): void
    {
        $line = $this->lineOf($this->agencyA);

        $this->actingAs($this->adminB)
            ->getJson("/api/bank-statements/{$line->bank_statement_id}/lines")
            ->assertForbidden();
    }

    public function test_the_admin_of_another_agency_cannot_search_payments(): void
    {
        $this->actingAs($this->adminB)
            ->getJson("/api/agencies/{$this->agencyA->id}/bank-statements/payment-search?q=LPY")
            ->assertForbidden();
    }

    public function test_the_admin_of_another_agency_cannot_see_the_statement(): void
    {
        $line = $this->lineOf($this->agencyA);

        $this->actingAs($this->adminB)
            ->getJson("/api/bank-statements/{$line->bank_statement_id}")
            ->assertForbidden();
    }

    // ─── 2. Le service : le paiement d'une autre agence ──────────

    public function test_a_legitimate_caller_cannot_match_a_payment_of_another_agency(): void
    {
        // L'appelant EST l'admin de l'agence A et la ligne EST celle de A :
        // la policy passe. C'est le paiement qui appartient à B. Sans cette
        // garde, l'argent de B se retrouverait rapproché sur le relevé de A.
        $line = $this->lineOf($this->agencyA);
        $foreignPayment = $this->paymentOf($this->agencyB, 15000);

        $this->actingAs($this->adminA)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'lease_payment',
                'payment_id' => $foreignPayment->id,
            ])
            ->assertForbidden();

        $this->assertSame(
            BankStatementLineMatchStatus::Suggested,
            $line->refresh()->match_status,
        );
        $this->assertNull($foreignPayment->refresh()->bank_statement_line_id);
        $this->assertNull($foreignPayment->bank_reconciled_at);
    }

    public function test_the_same_payment_of_the_own_agency_is_accepted(): void
    {
        // Le témoin du cas précédent : tout est identique SAUF l'agence du
        // paiement. Sans lui, un 403 systématique passerait pour une garde.
        $line = $this->lineOf($this->agencyA);
        $ownPayment = $this->paymentOf($this->agencyA, 15000);

        $this->actingAs($this->adminA)
            ->postJson("/api/bank-statement-lines/{$line->id}/match", [
                'payment_type' => 'lease_payment',
                'payment_id' => $ownPayment->id,
            ])
            ->assertOk();

        $this->assertSame($line->id, $ownPayment->refresh()->bank_statement_line_id);
    }

    // ─── Helpers ─────────────────────────────────────────────────

    /** @param array<string,mixed> $attributes */
    private function lineOf(Agency $agency, array $attributes = []): BankStatementLine
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $agency->id,
            'uploaded_by' => $agency->primary_admin_id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        return BankStatementLine::factory()->create(array_merge([
            'bank_statement_id' => $statement->id,
            'amount' => 15000,
            'currency' => 'XOF',
            'match_status' => BankStatementLineMatchStatus::Suggested,
        ], $attributes));
    }

    private function paymentOf(Agency $agency, int $amount): LeasePayment
    {
        $lease = Lease::factory()->create(['agency_id' => $agency->id]);

        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'amount' => $amount,
            'currency' => Currency::XOF,
            'bank_reconciled_at' => null,
            'bank_statement_line_id' => null,
        ]);
    }
}
