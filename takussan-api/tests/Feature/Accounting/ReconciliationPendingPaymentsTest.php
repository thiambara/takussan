<?php

namespace Tests\Feature\Accounting;

use App\Models\BookingPayment;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Support\RapprochementFixture;

/**
 * TCK-2674 (AC2, AC4) — `GET /api/agencies/{agency}/reconciliation/pending-payments` : les paiements
 * à rapprocher de la période, chacun avec la ligne de relevé que le matcher lui propose — celle que
 * `match` acceptera.
 */
class ReconciliationPendingPaymentsTest extends ApiTestCase
{
    use RapprochementFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpRapprochement();
    }

    private function pending(string $query = '', ?User $as = null): TestResponse
    {
        $this->actingAsApi($as ?? $this->admin);

        return $this->getJson("/api/agencies/{$this->agency->id}/reconciliation/pending-payments?period=2026-11".$query);
    }

    public function test_ac2_la_ligne_proposee_a_96_puis_confirmee_le_paiement_sort_du_reste(): void
    {
        $payment = $this->leasePayment(['amount' => 175000, 'reference_number' => 'LPY-AWA-11']);
        $this->leasePayment(['payment_method' => PaymentMethod::BankTransfer]);
        $line = $this->suggestedLine($payment, 96);

        $row = collect($this->pending()->assertOk()->assertJsonPath('meta.total', 2)->json('data'))->firstWhere('id', $payment->id);
        $this->assertSame('lease_payment', $row['type']);
        $this->assertSame('LPY-AWA-11', $row['reference']);
        $this->assertSame('Awa Diop', $row['payer']['name']);
        $this->assertSame($this->lease->property_id, $row['property']['id']);
        $this->assertEquals(175000, $row['amount']);
        $this->assertSame('cash', $row['payment_method']);
        $this->assertSame('2026-11-10T09:00:00+00:00', $row['paid_at']);
        $this->assertSame([
            'id' => $line->id, 'statement_id' => $line->bank_statement_id, 'date' => '2026-11-11',
            'label' => 'VIR AWA DIOP LOYER NOV', 'amount' => '175000.00', 'confidence' => 96,
        ], $row['suggested_line']);

        $this->getJson("/api/agencies/{$this->agency->id}/reconciliation/overview?period=2026-11")->assertJsonPath('data.to_reconcile.total', 2);
        $this->postJson("/api/bank-statement-lines/{$line->id}/match", ['payment_type' => 'lease_payment', 'payment_id' => $payment->id])->assertOk();

        $ids = collect($this->pending()->assertOk()->json('data'))->pluck('id')->all();
        $this->assertNotContains($payment->id, $ids);
        $this->getJson("/api/agencies/{$this->agency->id}/reconciliation/overview?period=2026-11")->assertJsonPath('data.to_reconcile.total', 1);
    }

    public function test_la_proposition_est_une_que_match_accepte_et_la_meilleure(): void
    {
        $payment = $this->leasePayment();
        $this->suggestedLine($payment, 99, statement: $this->statement(['status' => BankStatementStatus::Reconciled]));
        $this->suggestedLine($payment, 98, ['direction' => BankStatementLineDirection::Debit]);
        $this->suggestedLine($payment, 97, ['currency' => 'EUR']);
        $this->suggestedLine($payment, 95, statement: $this->statement(agency: $this->otherAgency));
        $this->suggestedLine($payment, 70);
        $best = $this->suggestedLine($payment, 80);
        $this->suggestedLine($payment, 80);

        $this->assertSame($best->id, $this->pending()->assertOk()->json('data.0.suggested_line.id'));
    }

    public function test_filtres_moyen_et_proposition_et_tri_par_montant(): void
    {
        $cash = $this->leasePayment(['amount' => 50000]);
        $transfer = $this->leasePayment(['amount' => 300000, 'payment_method' => PaymentMethod::BankTransfer]);
        $check = $this->leasePayment(['amount' => 200000, 'payment_method' => PaymentMethod::Check]);
        $this->suggestedLine($transfer, 90);

        $this->assertSame([$transfer->id, $check->id, $cash->id], collect($this->pending()->json('data'))->pluck('id')->all());
        $this->assertSame([$transfer->id, $cash->id], collect($this->pending('&filter[payment_method]=cash,bank_transfer')->json('data'))->pluck('id')->all());
        $this->assertSame([$transfer->id], collect($this->pending('&filter[has_suggestion]=1')->json('data'))->pluck('id')->all());
        $this->assertSame([$check->id, $cash->id], collect($this->pending('&filter[has_suggestion]=0')->json('data'))->pluck('id')->all());
        $this->assertNull($this->pending('&filter[payment_method]=cash')->json('data.0.suggested_line'));
        $this->pending('&filter[payment_method]=bitcoin')->assertUnprocessable();
        // Une valeur en liste n'accuse jamais le serveur (ADR-0075 § 3).
        $this->pending('&filter[payment_method][]=cash')->assertUnprocessable();
        $this->pending('&filter[has_suggestion][]=1')->assertUnprocessable();
        $this->pending('&period[]=2026-11')->assertUnprocessable();
    }

    public function test_ni_confirme_par_passerelle_ni_rapproche_ni_hors_periode_ni_autre_agence(): void
    {
        $this->leasePayment(['payment_method' => PaymentMethod::Wave, 'metadata' => $this->gatewaySettled('wave', 'wv_1'), 'marked_paid_at' => null]);
        $this->leasePayment(['bank_reconciled_at' => '2026-11-12 00:00:00']);
        $this->leasePayment(['paid_at' => '2026-10-10 09:00:00']);
        $this->leasePayment(['status' => PaymentStatus::Pending, 'paid_at' => null]);
        $this->leasePayment(['lease_id' => Lease::factory()->create(['agency_id' => $this->otherAgency->id])->id]);
        $kept = $this->leasePayment();

        $this->assertSame([$kept->id], collect($this->pending()->assertOk()->json('data'))->pluck('id')->all());
    }

    public function test_un_acompte_de_reservation_saisi_a_la_main(): void
    {
        $booking = $this->booking();
        $payment = BookingPayment::factory()->create(['booking_id' => $booking->id, 'status' => PaymentStatus::Paid,
            'paid_at' => '2026-11-04 10:00:00', 'payment_method' => PaymentMethod::Cash, 'amount' => 80000]);
        $line = $this->suggestedLine($payment, 91);

        $row = $this->pending()->assertOk()->json('data.0');
        $this->assertSame(['booking_payment', $payment->id, $line->id], [$row['type'], $row['id'], $row['suggested_line']['id']]);
        $this->assertSame($booking->property_id, $row['property']['id']);
    }

    /** UNE règle : le compte « à rapprocher » de la synthèse est le total de la liste, quelles que soient les données. */
    public function test_le_compte_de_la_synthese_est_le_total_de_la_liste(): void
    {
        $this->paidLeasePayments(7, PaymentMethod::Wave, $this->gatewaySettled('wave', 'wv_1'));
        $this->paidLeasePayments(3, PaymentMethod::Cash, $this->manuallySettled());
        $this->paidLeasePayments(2, PaymentMethod::Wave, null);
        $this->paidLeasePayments(2, PaymentMethod::BankTransfer, ['gateway' => ['settled_by' => '']]);
        $this->paidLeasePayments(1, PaymentMethod::BankTransfer, $this->manuallySettled(), ['bank_reconciled_at' => '2026-11-12 00:00:00']);
        $this->paidLeasePayments(1, PaymentMethod::Cash, $this->manuallySettled(), ['paid_at' => '2026-10-02 00:00:00']);
        BookingPayment::factory()->create(['booking_id' => $this->booking()->id, 'status' => PaymentStatus::Paid,
            'paid_at' => '2026-11-04 10:00:00', 'payment_method' => PaymentMethod::Check]);

        $listed = $this->pending('&per_page=100')->assertOk()->json('meta.total');
        $counted = $this->getJson("/api/agencies/{$this->agency->id}/reconciliation/overview?period=2026-11")->assertOk()->json('data.to_reconcile.total');

        $this->assertSame(8, $listed);
        $this->assertSame($listed, $counted);
    }

    public function test_ac4_un_agent_et_une_autre_agence_recoivent_403(): void
    {
        $this->pending(as: $this->agent)->assertForbidden();
        $this->pending(as: $this->otherAdmin)->assertForbidden();
    }

    public function test_pagination(): void
    {
        foreach (range(1, 3) as $i) {
            $this->leasePayment(['amount' => 1000 * $i]);
        }

        $this->pending('&per_page=2')->assertOk()->assertJsonPath('meta.total', 3)->assertJsonPath('meta.last_page', 2)->assertJsonCount(2, 'data');
    }
}
