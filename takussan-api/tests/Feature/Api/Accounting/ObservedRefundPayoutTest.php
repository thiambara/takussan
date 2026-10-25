<?php

namespace Tests\Feature\Api\Accounting;

use App\Http\Resources\PayoutResource;
use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use App\Models\Enums\BankStatementStatus;
use App\Models\Enums\PayeeRole;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\Property;
use App\Models\User;
use App\Services\Accounting\ReconciliationManager;
use App\Services\Accounting\ReconciliationMatcher;
use App\Services\Model\BookingPaymentService;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Payout\PayoutApprovalRule;
use App\Services\Payout\PayoutCalculator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * TCK-2052 (P110.01, ADR-0039 amendement du 2026-10-23) — un remboursement d'acompte ou de loyer
 * déjà sorti donne un `Payout` « constaté », né `completed` dans la transaction du remboursement :
 * le débit du relevé s'y rapproche, et le relevé se clôt `reconciled`. Avant : le débit ne trouvait
 * aucun candidat, sa confirmation rendait 422 `payment_type`, et le relevé restait
 * `partially_reconciled`.
 */
class ObservedRefundPayoutTest extends TestCase
{
    use EncaissementsPlateforme, RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $this->agency->update(['primary_admin_id' => $this->admin->id]);
    }

    public function test_le_debit_d_un_acompte_rembourse_a_la_main_se_rapproche_et_le_releve_se_clot(): void
    {
        $this->travelTo('2026-04-14 10:00:00');
        [$payment, $landlord] = $this->acomptePaye(100_000);

        $this->actingAs($this->admin);
        app(BookingPaymentService::class)->refund($payment, ['refund_amount' => 100_000]);

        $payout = $this->constateDe($payment);
        $this->assertSame(PayoutStatus::Completed, $payout->status);
        $this->assertSame(PayeeRole::Tenant, $payout->payee_role);
        $this->assertSame($landlord->id, $payout->landlord_id, 'landlord_id d\'un acompte = le bailleur du bien.');
        $this->assertSame($this->agency->id, $payout->agency_id);
        $this->assertEquals(100_000, (float) $payout->net_amount);
        $this->assertEquals(100_000, (float) $payout->gross_amount);
        $this->assertNull($payout->approved_by_id);
        $this->assertSame($this->admin->id, $payout->issued_by_id);
        $this->assertSame('2026-04-14', $payout->processed_at?->toDateString());
        $this->assertSame(0, $payout->bookingPayments()->count(), 'Le constaté ne s\'attache à aucun pivot.');

        [$statement, $line] = $this->debit(100_000, '2026-04-18');
        $suggestion = app(ReconciliationMatcher::class)->suggestFor($line);
        $this->assertNotNull($suggestion, 'Le débit n\'a rien à quoi se rapprocher.');
        $this->assertSame(Payout::class, $suggestion->paymentType);
        $this->assertSame($payout->id, $suggestion->paymentId);

        app(ReconciliationManager::class)->confirmMatch($line, $payout, $this->admin);
        $this->assertSame(
            BankStatementStatus::Reconciled,
            app(ReconciliationManager::class)->finalize($statement->refresh(), $this->admin)->status,
        );
        $this->assertNotNull($payout->refresh()->bank_reconciled_at);
    }

    public function test_le_debit_d_un_loyer_rembourse_par_le_webhook_se_rapproche(): void
    {
        $this->travelTo('2026-05-03 09:00:00');
        $lease = $this->bail();
        $rent = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'amount' => 150_000, 'payer_id' => $lease->tenant_id]);
        $this->soldeParLAgence($rent, $this->agency);

        $this->assertSame(1, $this->rembourserParWebhook($rent, 150_000));

        $this->assertSame(PaymentStatus::Refunded, $rent->refresh()->status);
        $payout = $this->constateDe($rent);
        $this->assertSame(PayoutStatus::Completed, $payout->status);
        $this->assertSame($lease->landlord_id, $payout->landlord_id);
        $this->assertSame($lease->id, $payout->lease_id);
        $this->assertNull($payout->issued_by_id);
        $this->assertEquals(150_000, (float) $payout->net_amount);

        [$statement, $line] = $this->debit(150_000, '2026-05-07');
        $suggestion = app(ReconciliationMatcher::class)->suggestFor($line);
        $this->assertSame($payout->id, $suggestion?->paymentId);
        app(ReconciliationManager::class)->confirmMatch($line, $payout, $this->admin);
        $this->assertSame(
            BankStatementStatus::Reconciled,
            app(ReconciliationManager::class)->finalize($statement->refresh(), $this->admin)->status,
        );
    }

    public function test_un_remboursement_recu_avant_le_paiement_donne_le_constate_quand_le_paiement_arrive(): void
    {
        [$payment, $landlord] = $this->acomptePaye(60_000, paid: false);
        $this->soldeParLAgence($payment, $this->agency);
        $meta = $payment->metadata;
        unset($meta['gateway']['settled_by']);
        $payment->forceFill(['metadata' => $meta])->save();
        $integration = Integration::query()->findOrFail($meta['gateway']['integration_id']);
        $event = fn (string $type) => app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave', $type, $meta['gateway']['transaction_id'], ['amount' => '60000', 'currency' => 'XOF'], WebhookAuthority::of($integration),
        ));

        $event(PaymentEvent::TYPE_REFUNDED);
        $this->assertSame(0, Payout::query()->count(), 'Rien n\'est encore sorti : le paiement n\'est pas arrivé.');

        $event(PaymentEvent::TYPE_PAID);

        $this->assertSame(PaymentStatus::Refunded, $payment->refresh()->status);
        $payout = $this->constateDe($payment);
        $this->assertSame($landlord->id, $payout->landlord_id);
        $this->assertEquals(60_000, (float) $payout->net_amount);
    }

    public function test_un_loyer_rembourse_ne_compte_pas_dans_le_seuil_de_la_caution_suivante(): void
    {
        $lease = $this->bail();
        $rent = LeasePayment::factory()->paid()->create(['lease_id' => $lease->id, 'amount' => 150_000, 'payer_id' => $lease->tenant_id]);
        $this->soldeParLAgence($rent, $this->agency);
        $this->rembourserParWebhook($rent, 150_000);
        $this->constateDe($rent);

        $this->assertSame(
            0.0,
            app(PayoutApprovalRule::class)->unapprovedRecentNet($this->agency, PayeeRole::Tenant, (int) $lease->tenant_id),
            'Le constaté a gonflé le cumul des sorties non approuvées du locataire.',
        );
    }

    public function test_deux_remboursements_partiels_donnent_deux_constates_et_l_acompte_reste_preparable(): void
    {
        [$payment, $landlord] = $this->acomptePaye(100_000);
        $this->actingAs($this->admin);

        app(BookingPaymentService::class)->refund($payment, ['refund_amount' => 30_000]);
        app(BookingPaymentService::class)->refund($payment->refresh(), ['refund_amount' => 20_000]);

        $this->assertSame(PaymentStatus::Paid, $payment->refresh()->status);
        $montants = Payout::query()->where('refunded_payment_id', $payment->id)->orderBy('id')->pluck('net_amount')->map(fn ($m) => (float) $m)->all();
        $this->assertSame([30_000.0, 20_000.0], $montants, 'Chaque constaté porte la part neuve, pas le cumul.');

        $preparables = app(PayoutCalculator::class)->bookingPayments($this->agency->id, $landlord->id)->pluck('booking_payments.id')->all();
        $this->assertContains($payment->id, $preparables, 'L\'acompte partiellement remboursé n\'est plus préparable pour le bailleur.');
    }

    public function test_un_acompte_encaisse_par_la_plateforme_et_rembourse_par_webhook_ne_cree_aucun_payout(): void
    {
        [$payment] = $this->acomptePaye(80_000);
        $this->soldeParLaPlateforme($payment);

        $this->assertSame(1, $this->rembourserParWebhook($payment, 80_000));

        $this->assertSame(PaymentStatus::Refunded, $payment->refresh()->status);
        $this->assertSame(0, Payout::query()->count());
    }

    public function test_temoin_un_acompte_encaisse_par_l_agence_et_rembourse_par_webhook_cree_le_constate(): void
    {
        [$payment, $landlord] = $this->acomptePaye(80_000);
        $this->soldeParLAgence($payment, $this->agency);

        $this->rembourserParWebhook($payment, 80_000);

        $this->assertSame($landlord->id, $this->constateDe($payment)->landlord_id);
    }

    public function test_la_ressource_rend_la_marque_du_constate(): void
    {
        [$payment] = $this->acomptePaye(40_000);
        $this->actingAs($this->admin);
        app(BookingPaymentService::class)->refund($payment, ['refund_amount' => 40_000]);

        $data = PayoutResource::make($this->constateDe($payment))->toArray(Request::create('/'));
        $this->assertSame('booking_payment', $data['refunded_payment_type']);
        $this->assertSame($payment->id, $data['refunded_payment_id']);
    }

    private function constateDe(Model $payment): Payout
    {
        $payouts = Payout::query()
            ->where('refunded_payment_type', $payment::class)
            ->where('refunded_payment_id', $payment->getKey())
            ->get();
        $this->assertCount(1, $payouts, 'Un remboursement sorti, un constaté.');

        $payout = $payouts->first();
        $this->assertTrue($payout->refundedPayment->is($payment));

        return $payout;
    }

    /** @return array{0: BookingPayment, 1: User} */
    private function acomptePaye(int $amount, bool $paid = true): array
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $landlord->id]);
        $payment = ($paid ? BookingPayment::factory()->paid() : BookingPayment::factory())->create([
            'booking_id' => Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $this->agency->id])->id,
            'amount' => $amount,
            'currency' => 'XOF',
        ]);

        return [$payment, $landlord];
    }

    private function bail(): Lease
    {
        return Lease::factory()->create([
            'agency_id' => $this->agency->id,
            'tenant_id' => Customer::factory()->create()->id,
        ]);
    }

    private function rembourserParWebhook(Model $payment, int $amount): int
    {
        $integration = Integration::query()->findOrFail($payment->metadata['gateway']['integration_id']);

        return app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave',
            PaymentEvent::TYPE_REFUNDED,
            $payment->metadata['gateway']['settled_by'],
            ['amount' => (string) $amount, 'currency' => 'XOF'],
            WebhookAuthority::of($integration),
        ));
    }

    /** @return array{0: BankStatement, 1: BankStatementLine} */
    private function debit(int $amount, string $postedAt): array
    {
        $statement = BankStatement::factory()->create([
            'agency_id' => $this->agency->id,
            'uploaded_by' => $this->admin->id,
            'status' => BankStatementStatus::ReadyForReview,
        ]);

        $line = BankStatementLine::factory()->create([
            'bank_statement_id' => $statement->id,
            'direction' => BankStatementLineDirection::Debit,
            'amount' => $amount,
            'currency' => 'XOF',
            'posted_at' => $postedAt,
            'match_status' => BankStatementLineMatchStatus::Unmatched,
            'matched_payment_type' => null,
            'matched_payment_id' => null,
        ]);

        return [$statement, $line];
    }
}
