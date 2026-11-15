<?php

namespace Tests\Feature\Accounting;

use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Support\LeaseDueFixture;
use Tests\Support\RapprochementFixture;

/**
 * TCK-2674 (AC1, AC4) — `GET /api/agencies/{agency}/reconciliation/overview?period=YYYY-MM` : ce que
 * Wave et Orange Money ont déjà confirmé, et ce qui reste à rapprocher à la main.
 */
class ReconciliationOverviewTest extends ApiTestCase
{
    use LeaseDueFixture, RapprochementFixture, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpRapprochement();
    }

    private function overview(string $period = '2026-11', ?User $as = null, ?Agency $agency = null): TestResponse
    {
        $this->actingAsApi($as ?? $this->admin);

        return $this->getJson('/api/agencies/'.($agency ?? $this->agency)->id.'/reconciliation/overview?period='.$period);
    }

    public function test_ac1_812_confirmes_par_les_passerelles_et_34_a_rapprocher(): void
    {
        $this->paidLeasePayments(540, PaymentMethod::Wave, $this->gatewaySettled('wave', 'wv_1'));
        $this->paidLeasePayments(272, PaymentMethod::OrangeMoney, $this->gatewaySettled('orange_money', 'om_1'));
        $this->paidLeasePayments(21, PaymentMethod::Cash, $this->manuallySettled(), ['marked_paid_at' => '2026-11-10 09:05:00']);
        $this->paidLeasePayments(13, PaymentMethod::BankTransfer, $this->manuallySettled(), ['marked_paid_at' => '2026-11-10 09:05:00']);

        $this->overview()->assertOk()->assertExactJson(['data' => [
            'period' => '2026-11',
            'payments_total' => 846,
            'confirmed_automatically' => ['total' => 812, 'by_provider' => ['wave' => 540, 'orange_money' => 272]],
            'to_reconcile' => ['total' => 34, 'by_method' => ['cash' => 21, 'bank_transfer' => 13]],
            'reconciled_manually' => 0,
        ]]);
    }

    public function test_le_fournisseur_est_celui_de_la_transaction_qui_a_solde(): void
    {
        // Un checkout Orange Money soldé, puis un checkout Wave ouvert ensuite (et jamais payé) :
        // `gateway.provider` dit `wave`, mais l'argent est venu par Orange Money.
        $this->paidLeasePayments(1, PaymentMethod::OrangeMoney, ['gateway' => [
            'provider' => 'wave', 'transaction_id' => 'wv_2', 'settled_by' => 'om_1',
            'transactions' => [['transaction_id' => 'om_1', 'provider' => 'orange_money'], ['transaction_id' => 'wv_2', 'provider' => 'wave']],
        ]]);

        $this->overview()->assertOk()->assertJsonPath('data.confirmed_automatically.by_provider', ['orange_money' => 1]);
    }

    public function test_le_vrai_chemin_d_un_webhook_wave_et_d_un_encaissement_saisi(): void
    {
        $ctx = $this->leaseDue(payment: ['late_fee_amount' => 0, 'late_fee_applied_at' => null, 'status' => PaymentStatus::Pending]);
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $ctx['agency']);
        $ctx['agency']->update(['primary_admin_id' => $admin->id]);
        $this->spyDriver();
        $this->actingAs($ctx['tenant'], 'sanctum');
        $this->postJson('/api/lease-payments/'.$ctx['payment']->id.'/initiate', ['provider' => 'wave'])->assertOk();
        $this->waveWebhook('spy_txn_1', 150000)->assertOk();
        $this->assertSame(PaymentStatus::Paid, $ctx['payment']->fresh()->status, 'précondition : soldé par le webhook');

        $cash = $ctx['lease']->payments()->create([
            'payer_id' => $ctx['payment']->payer_id, 'reference_number' => 'LPY-CASH-1', 'amount' => 150000, 'currency' => 'XOF',
            'payment_type' => LeasePaymentType::Rent, 'status' => PaymentStatus::Pending, 'due_date' => '2026-12-05',
            'period_start' => '2026-12-01', 'period_end' => '2026-12-31',
        ]);
        $this->actingAsApi($ctx['agent']);
        $this->postJson("/api/lease-payments/{$cash->id}/mark-paid", ['payment_method' => 'cash'])->assertOk();

        $this->actingAsApi($admin);
        $this->getJson("/api/agencies/{$ctx['agency']->id}/reconciliation/overview?period=2026-11")->assertOk()
            ->assertJsonPath('data.confirmed_automatically', ['total' => 1, 'by_provider' => ['wave' => 1]])
            ->assertJsonPath('data.to_reconcile', ['total' => 1, 'by_method' => ['cash' => 1]]);
    }

    public function test_ne_comptent_ni_les_autres_mois_ni_l_impaye_ni_la_caution_rendue_ni_l_autre_agence(): void
    {
        $this->paidLeasePayments(1, PaymentMethod::Cash, $this->manuallySettled(), ['paid_at' => '2026-10-31 23:59:59']);
        $this->paidLeasePayments(1, PaymentMethod::Cash, $this->manuallySettled(), ['paid_at' => '2026-12-01 00:00:00']);
        $this->paidLeasePayments(1, PaymentMethod::Cash, null, ['status' => PaymentStatus::Pending->value, 'paid_at' => null]);
        $this->paidLeasePayments(1, PaymentMethod::Cash, null, ['payment_type' => LeasePaymentType::DepositRefund->value]);
        $this->paidLeasePayments(1, PaymentMethod::Cash, $this->manuallySettled(), ['status' => PaymentStatus::Refunded->value, 'refund_amount' => 100000]);
        $otherLease = Lease::factory()->create(['agency_id' => $this->otherAgency->id]);
        $this->paidLeasePayments(1, PaymentMethod::Cash, $this->manuallySettled(), [], $otherLease);
        $this->paidLeasePayments(1, PaymentMethod::Cash, $this->manuallySettled(), ['paid_at' => '2026-11-01 00:00:00']);

        $this->overview()->assertOk()
            ->assertJsonPath('data.payments_total', 1)
            ->assertJsonPath('data.to_reconcile.total', 1);
    }

    public function test_un_paiement_rapproche_a_la_main_sort_du_reste(): void
    {
        $this->paidLeasePayments(2, PaymentMethod::BankTransfer, $this->manuallySettled());
        $this->paidLeasePayments(1, PaymentMethod::BankTransfer, $this->manuallySettled(), ['bank_reconciled_at' => '2026-11-12 00:00:00']);
        // Confirmé par la passerelle ET rapproché : il reste « confirmé automatiquement ».
        $this->paidLeasePayments(1, PaymentMethod::Wave, $this->gatewaySettled('wave', 'wv_9'), ['bank_reconciled_at' => '2026-11-12 00:00:00']);

        $this->overview()->assertOk()
            ->assertJsonPath('data.payments_total', 4)
            ->assertJsonPath('data.confirmed_automatically.total', 1)
            ->assertJsonPath('data.to_reconcile.total', 2)
            ->assertJsonPath('data.reconciled_manually', 1);
    }

    public function test_sans_reglement_par_passerelle_le_paiement_est_a_rapprocher(): void
    {
        // Payé sans trace de passerelle ni de saisie (données d'avant TCK-593), ou après un checkout
        // ouvert puis abandonné : rien ne l'a confirmé, il est à rapprocher.
        $this->paidLeasePayments(1, PaymentMethod::Wave, null);
        $this->paidLeasePayments(1, PaymentMethod::Wave, ['gateway' => ['provider' => 'wave', 'transaction_id' => 'wv_3']]);
        $this->paidLeasePayments(1, PaymentMethod::Wave, ['gateway' => ['settled_by' => '']]);

        $response = $this->overview()->assertOk()
            ->assertJsonPath('data.confirmed_automatically.total', 0)
            ->assertJsonPath('data.to_reconcile', ['total' => 3, 'by_method' => ['wave' => 3]]);
        // Vide, un objet et non une liste : la forme ne dépend pas des données.
        $this->assertStringContainsString('"confirmed_automatically":{"total":0,"by_provider":{}}', $response->getContent());
    }

    public function test_les_acomptes_de_reservation_comptent(): void
    {
        $booking = $this->booking();
        BookingPayment::factory()->create(['booking_id' => $booking->id, 'status' => PaymentStatus::Paid, 'paid_at' => '2026-11-03 10:00:00',
            'payment_method' => PaymentMethod::Wave, 'metadata' => $this->gatewaySettled('wave', 'wv_b')]);
        BookingPayment::factory()->create(['booking_id' => $booking->id, 'status' => PaymentStatus::Paid, 'paid_at' => '2026-11-04 10:00:00',
            'payment_method' => PaymentMethod::Cash]);
        BookingPayment::factory()->create(['booking_id' => $this->booking($this->otherAgency)->id, 'status' => PaymentStatus::Paid,
            'paid_at' => '2026-11-04 10:00:00', 'payment_method' => PaymentMethod::Cash]);

        $this->overview()->assertOk()
            ->assertJsonPath('data.payments_total', 2)
            ->assertJsonPath('data.confirmed_automatically.by_provider', ['wave' => 1])
            ->assertJsonPath('data.to_reconcile.by_method', ['cash' => 1]);
    }

    public function test_sans_periode_le_mois_courant_et_une_periode_invalide_rend_422(): void
    {
        $this->paidLeasePayments(1, PaymentMethod::Cash, $this->manuallySettled());
        $this->actingAsApi($this->admin);

        $this->getJson("/api/agencies/{$this->agency->id}/reconciliation/overview")->assertOk()
            ->assertJsonPath('data.period', '2026-11')->assertJsonPath('data.payments_total', 1);
        $this->overview('2026-13')->assertUnprocessable()->assertJsonValidationErrors('period');
        $this->overview('novembre')->assertUnprocessable()->assertJsonValidationErrors('period');
    }

    public function test_ac4_un_agent_et_une_autre_agence_recoivent_403(): void
    {
        $this->overview(as: $this->agent)->assertForbidden();
        $this->overview(as: $this->otherAdmin)->assertForbidden();
        // Le 403 passe avant le 422.
        $this->overview('xx', $this->agent)->assertForbidden();
    }
}
