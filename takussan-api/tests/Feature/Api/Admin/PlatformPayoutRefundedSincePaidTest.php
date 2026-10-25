<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\Integration;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\PlatformPayout;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Payments\Dto\PaymentEvent;
use App\Services\Payments\Dto\WebhookAuthority;
use App\Services\Payments\PaymentGatewayService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * TCK-2320 (P39.07) — un reversement de la plateforme déjà `paid` dont une ligne est remboursée
 * depuis, par le fournisseur : la console super-admin le signale, et l'agence en est avisée. Aucun
 * montant n'est écrit : ni sur le reversement, ni dans l'avis. La compensation sur le prochain
 * reversement reste au porteur.
 *
 * Avant : le remboursement d'une ligne d'un reversement payé ne laissait aucune trace sur lui
 * (`refunded_since_paid` absent) et aucun avis ne partait.
 */
class PlatformPayoutRefundedSincePaidTest extends TestCase
{
    use EncaissementsPlateforme;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-05 08:00:00');
        $this->agency = Agency::factory()->create(['is_verified' => true]);
        $this->admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    public function test_a_paid_payout_whose_rent_is_refunded_since_is_flagged_without_amount_and_the_agency_is_told(): void
    {
        $rent = $this->platformRent(100_000);
        $payout = $this->closeAndPay();

        $this->travelTo('2026-10-12 10:00:00');
        $this->assertSame(1, $this->refundByWebhook($rent, 100_000));

        $payout->refresh();
        $this->assertSame(PlatformPayoutStatus::Paid, $payout->status);
        $this->assertEquals(100_000, $payout->gross_amount, 'aucun montant n\'est réécrit');

        $this->actingAsRole('super_admin');
        $data = $this->getJson("/api/admin/payouts/{$payout->id}")->assertOk()->json('data');
        $this->assertSame([[
            'payment_type' => 'lease_payment',
            'payment_id' => $rent->id,
            'reference_number' => $rent->reference_number,
            'refunded_at' => '2026-10-12T10:00:00+00:00',
        ]], $data['refunded_since_paid']);
        $this->assertSame($data['refunded_since_paid'], $this->getJson('/api/admin/payouts')->json('data.0.refunded_since_paid'));

        $notice = AppNotification::query()->where('user_id', $this->admin->id)->where('code', 'platform_payout.refunded_since_paid')->sole();
        $this->assertSame(['period' => '2026-09', 'reference' => $rent->reference_number], $notice->params);
    }

    public function test_a_partial_refund_of_a_platform_deposit_is_flagged_once_per_line(): void
    {
        $deposit = $this->platformDeposit(80_000);
        $payout = $this->closeAndPay();

        $this->travelTo('2026-10-12 10:00:00');
        $this->refundByWebhook($deposit, 30_000);
        $this->assertSame(PaymentStatus::Paid, $deposit->refresh()->status, 'un partiel laisse la ligne payée');

        $this->actingAsRole('super_admin');
        $flagged = $this->getJson("/api/admin/payouts/{$payout->id}")->assertOk()->json('data.refunded_since_paid');
        $this->assertCount(1, $flagged);
        $this->assertSame(['booking_payment', $deposit->id], [$flagged[0]['payment_type'], $flagged[0]['payment_id']]);
        $this->assertSame(1, AppNotification::query()->where('code', 'platform_payout.refunded_since_paid')->count());
    }

    public function test_a_refund_before_payment_flags_nothing(): void
    {
        $rent = $this->platformRent(100_000);
        $this->closeAndPay(pay: false);

        $this->refundByWebhook($rent, 100_000);

        $this->actingAsRole('super_admin');
        $this->assertSame([], $this->getJson('/api/admin/payouts')->json('data.0.refunded_since_paid'));
        $this->assertSame(0, AppNotification::query()->where('code', 'platform_payout.refunded_since_paid')->count());
    }

    private function platformRent(int $amount): LeasePayment
    {
        return $this->soldeParLaPlateforme(LeasePayment::factory()->create([
            'lease_id' => Lease::factory()->create(['agency_id' => $this->agency->id])->id,
            'amount' => $amount,
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-09-15 10:00:00',
        ]));
    }

    private function platformDeposit(int $amount): BookingPayment
    {
        $property = Property::factory()->create(['agency_id' => $this->agency->id]);
        $booking = Booking::factory()->create([
            'agency_id' => $this->agency->id,
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $this->agency->id])->id,
        ]);

        return $this->soldeParLaPlateforme(BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => $amount,
            'payment_type' => BookingPaymentType::Deposit,
            'status' => PaymentStatus::Paid,
            'paid_at' => '2026-09-15 10:00:00',
        ]));
    }

    private function closeAndPay(bool $pay = true): PlatformPayout
    {
        $this->actingAsRole('super_admin');
        $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $this->agency->id,
            'period_end' => '2026-09-30',
        ])->assertCreated();

        $payout = PlatformPayout::query()->where('agency_id', $this->agency->id)->sole();
        if ($pay) {
            $payout->forceFill(['status' => PlatformPayoutStatus::Paid, 'processed_at' => now(), 'payment_reference' => 'VIR-1'])->save();
        }

        return $payout;
    }

    private function refundByWebhook(Model $payment, int $amount): int
    {
        $payment->refresh();
        $integration = Integration::query()->findOrFail($payment->metadata['gateway']['integration_id']);

        return app(PaymentGatewayService::class)->applyEventToMatchingPayment(new PaymentEvent(
            'wave',
            PaymentEvent::TYPE_REFUNDED,
            $payment->metadata['gateway']['settled_by'],
            ['amount' => (string) $amount, 'currency' => 'XOF'],
            WebhookAuthority::of($integration),
        ));
    }
}
