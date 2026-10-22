<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\PlatformPayout;
use App\Models\Property;
use App\Models\User;
use App\Services\Billing\PlatformPayoutService;
use App\Services\Model\BookingPaymentService;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use App\Services\Payout\PayoutCalculator;
use App\Services\Reporting\PlatformMetricsSnapshotter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Concerns\BuildsMoneyOut;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * TCK-1214 (P76.02, option (b) du porteur) — seul un remboursement TOTAL passe la ligne à
 * `refunded`. Un remboursement partiel la laisse `paid` avec son `refund_amount`, et les trois
 * lecteurs de l'argent (l'encaissé, la clôture de la plateforme, `PayoutCalculator` et sa
 * commission) la comptent à hauteur de `montant − refund_amount`, loyers comme acomptes.
 *
 * Avant : loyer de 150 000 remboursé de 40 000 → `refunded`, et les 110 000 gardés sortaient de
 * l'encaissé, de la clôture et du reversement au bailleur.
 */
class PartialRefundStaysPaidTest extends TestCase
{
    use BuildsMoneyOut;
    use CreatesAgencyMembers;
    use EncaissementsPlateforme;
    use RefreshDatabase;

    // ── L'écriture : webhook et geste manuel ────────────────────────────────────────────────────

    public function test_a_partial_refund_by_webhook_keeps_the_rent_paid(): void
    {
        $rent = $this->rentSettledByPlatform(150_000);

        $this->refundEvent($rent, 40_000);

        $rent->refresh();
        $this->assertSame(PaymentStatus::Paid, $rent->status);
        $this->assertEquals(40_000, $rent->refund_amount);
        $this->assertEquals(110_000, $rent->paid_amount);
    }

    public function test_a_full_refund_by_webhook_still_refunds_the_rent(): void
    {
        $rent = $this->rentSettledByPlatform(150_000);

        $this->refundEvent($rent, 150_000);

        $this->assertSame(PaymentStatus::Refunded, $rent->refresh()->status);
    }

    public function test_a_partial_manual_refund_keeps_the_deposit_paid(): void
    {
        $deposit = $this->deposit(50_000);

        app(BookingPaymentService::class)->refund($deposit, ['refund_amount' => '20000']);

        $deposit->refresh();
        $this->assertSame(PaymentStatus::Paid, $deposit->status);
        $this->assertEquals(20_000, $deposit->refund_amount);
        $this->assertEquals(30_000, $deposit->paid_amount);

        // Le second geste s'ajoute au premier ; au-delà du montant, refusé.
        try {
            app(BookingPaymentService::class)->refund($deposit, ['refund_amount' => '30001']);
            $this->fail('Un remboursement au-delà du reste encaissé a été accepté.');
        } catch (HttpExceptionInterface $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        app(BookingPaymentService::class)->refund($deposit, ['refund_amount' => '30000']);

        $deposit->refresh();
        $this->assertSame(PaymentStatus::Refunded, $deposit->status);
        $this->assertEquals(50_000, $deposit->refund_amount);
    }

    // ── Lecteur 1 : l'encaissé ──────────────────────────────────────────────────────────────────

    public function test_collected_counts_a_partially_refunded_rent_net(): void
    {
        $rent = $this->rentSettledByPlatform(150_000);
        $this->refundEvent($rent, 40_000);

        $this->assertEquals(110_000, app(PlatformMetricsSnapshotter::class)->collectedTotal());
    }

    public function test_collected_counts_a_partially_refunded_deposit_net(): void
    {
        $deposit = $this->deposit(50_000);
        app(BookingPaymentService::class)->refund($deposit, ['refund_amount' => '20000']);

        $this->assertEquals(30_000, app(PlatformMetricsSnapshotter::class)->collectedTotal());
    }

    // ── Lecteur 2 : la clôture de la plateforme ─────────────────────────────────────────────────

    public function test_closing_counts_a_partially_refunded_rent_net(): void
    {
        $rent = $this->rentSettledByPlatform(150_000);
        $this->refundEvent($rent, 40_000);

        $payout = $this->closePeriod($rent->lease->agency_id);

        $this->assertEquals(110_000, $payout->gross_amount);
        $this->assertSame($payout->id, $rent->fresh()->platform_payout_id);
        $this->assertEquals(110_000, app(PlatformPayoutService::class)->breakdown($payout)['lease']['gross']);
    }

    public function test_closing_counts_a_partially_refunded_deposit_net(): void
    {
        $deposit = $this->deposit(50_000);
        $this->soldeParLaPlateforme($deposit);
        // L'état que laisse le remboursement partiel rapporté par le fournisseur.
        $deposit->forceFill(['refund_amount' => 20_000])->save();

        $payout = $this->closePeriod($deposit->booking->agency_id);

        $this->assertEquals(30_000, $payout->gross_amount);
    }

    public function test_a_payout_whose_line_was_partially_refunded_after_closing_is_not_approved(): void
    {
        $rent = $this->rentSettledByPlatform(150_000);
        $payout = $this->closePeriod($rent->lease->agency_id);
        $this->refundEvent($rent, 40_000);

        $this->postJson("/api/admin/payouts/{$payout->id}/approve")
            ->assertStatus(422)
            ->assertJsonPath('code', 'platform_payout.items_changed');
        $this->assertSame(PlatformPayoutStatus::Pending, $payout->fresh()->status);
    }

    // ── Lecteur 3 : le reversement au bailleur ──────────────────────────────────────────────────

    public function test_landlord_payout_counts_a_partially_refunded_rent_net_with_its_commission(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 10), 150_000);
        $rent->forceFill(['refund_amount' => 40_000])->save();

        $calculator = app(PayoutCalculator::class);
        $rows = $calculator->leasePayments($agency->id, $landlord->id)->get();
        $this->assertSame([$rent->id], $rows->pluck('id')->all());

        $computed = $calculator->compute($agency, $rows, collect(), collect());
        $this->assertEquals(110_000, $computed['lines']['lease_payments'][0]['amount']);
        $this->assertEquals(11_000, $computed['lines']['lease_payments'][0]['commission']);
        $this->assertEquals(110_000, $computed['totals']['gross']);
        $this->assertEquals(99_000, $computed['totals']['net']);
    }

    public function test_landlord_payout_counts_a_partially_refunded_deposit_net_with_its_commission(): void
    {
        $agency = $this->moneyAgency(['commission_rate' => 10]);
        $landlord = $this->landlordOf($agency);
        $deposit = $this->deposit(50_000, $agency, $landlord);
        app(BookingPaymentService::class)->refund($deposit, ['refund_amount' => '20000']);

        $calculator = app(PayoutCalculator::class);
        $rows = $calculator->bookingPayments($agency->id, $landlord->id)->get();
        $this->assertSame([$deposit->id], $rows->pluck('id')->all());

        $computed = $calculator->compute($agency->refresh(), collect(), $rows, collect());
        $this->assertEquals(30_000, $computed['lines']['booking_payments'][0]['amount']);
        $this->assertEquals(3_000, $computed['lines']['booking_payments'][0]['commission']);
        $this->assertEquals(30_000, $computed['totals']['gross']);
    }

    public function test_a_landlord_payout_whose_rent_was_partially_refunded_is_not_marked_processed(): void
    {
        $agency = $this->moneyAgency();
        $landlord = $this->landlordOf($agency);
        $admin = $this->agencyAdmin($agency);
        $this->actingWithStepUp($admin);
        $rent = $this->leasePayment($this->leaseOf($agency, $landlord, 0), 150_000);

        $id = $this->postJson('/api/payouts', [
            'landlord_id' => $landlord->id,
            'lease_payment_ids' => [$rent->id],
        ])->assertCreated()->json('data.id');

        $rent->forceFill(['refund_amount' => 40_000])->save();

        $this->postJson("/api/payouts/{$id}/mark-processed", [
            'payment_method' => 'check',
            'transaction_id' => 'CHQ-0043',
        ])->assertStatus(422)->assertJsonPath('code', 'payout.items_changed');
    }

    // ── Fixtures ────────────────────────────────────────────────────────────────────────────────

    private function rentSettledByPlatform(float $amount): LeasePayment
    {
        $agency = Agency::factory()->create(['is_verified' => true, 'currency' => Currency::XOF]);

        /** @var LeasePayment */
        return $this->soldeParLaPlateforme(LeasePayment::factory()->create([
            'lease_id' => Lease::factory()->create(['agency_id' => $agency->id, 'currency' => Currency::XOF])->id,
            'amount' => $amount,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-09-15 10:00:00',
        ]));
    }

    private function deposit(float $amount, ?Agency $agency = null, ?User $landlord = null): BookingPayment
    {
        $agency ??= Agency::factory()->create(['is_verified' => true, 'currency' => Currency::XOF]);
        $property = Property::factory()->create(['agency_id' => $agency->id] + ($landlord ? ['user_id' => $landlord->id] : []));
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'agency_id' => $agency->id,
            'currency' => Currency::XOF,
        ]);

        return BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => $amount,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-09-15 10:00:00',
            'payment_type' => BookingPaymentType::Deposit,
            'refund_amount' => null,
        ]);
    }

    private function refundEvent(LeasePayment $rent, int $amount): void
    {
        $meta = $rent->fresh()->metadata;
        $integration = Integration::query()->findOrFail($meta['gateway']['integration_id']);

        app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave',
            PaymentEvent::TYPE_REFUNDED,
            $meta['gateway']['settled_by'],
            ['amount' => (string) $amount, 'currency' => 'XOF'],
            WebhookAuthority::of($integration),
        ));
    }

    private function closePeriod(int $agencyId): PlatformPayout
    {
        $this->actingAsRole('super_admin');
        $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $agencyId,
            'period_end' => '2026-09-30',
        ])->assertCreated();

        return PlatformPayout::query()->where('agency_id', $agencyId)->firstOrFail();
    }
}
