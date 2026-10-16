<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Plan;
use App\Models\PlatformPayout;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * TCK-733 (P04.05) — la clôture plateforme reverse ce que la PLATEFORME a encaissé : les seuls
 * paiements soldés par une intégration globale, pénalité encaissée avec le loyer comprise, et
 * jamais dans deux devises.
 */
class PlatformPayoutScopeTest extends TestCase
{
    use EncaissementsPlateforme;
    use RefreshDatabase;

    private const PAID_AT = '2026-09-15 10:00:00';

    public function test_ac1_only_payments_settled_by_a_global_integration_are_reversed(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();

        $platform = $this->soldeParLaPlateforme($this->bookingPayment($agency, 100_000));
        $cash = $this->bookingPayment($agency, 70_000);
        $own = $this->soldeParLAgence($this->leasePayment($agency, 50_000), $agency);

        $this->close($agency)->assertCreated();

        $payout = PlatformPayout::query()->where('agency_id', $agency->id)->firstOrFail();
        $this->assertSame('100000.00', (string) $payout->gross_amount);
        $this->assertSame($payout->id, $platform->fresh()->platform_payout_id);
        $this->assertNull($cash->fresh()->platform_payout_id);
        $this->assertNull($own->fresh()->platform_payout_id);
    }

    public function test_ac1_an_agency_whose_payments_are_all_its_own_gets_no_payout(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $this->bookingPayment($agency, 70_000);
        $this->soldeParLAgence($this->leasePayment($agency, 50_000), $agency);

        $response = $this->postJson('/api/admin/payouts/close-period', ['period_end' => '2026-09-30'])->assertCreated();

        $this->assertSame([], $response->json('data'));
        $this->assertSame(0, PlatformPayout::query()->count());
    }

    public function test_ac2_the_late_fee_settled_with_the_rent_enters_gross_fees_and_breakdown(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $this->subscribe($agency, feePct: 5);

        $rent = $this->leasePayment($agency, 200_000);
        $rent->forceFill(['late_fee_amount' => 10_000, 'late_fee_paid_at' => self::PAID_AT])->save();
        $this->soldeParLaPlateforme($rent, lateFee: 10_000);

        $this->close($agency)->assertCreated();

        // 200 000 + 10 000 encaissés ; 5 % de 210 000 = 10 500 ; net 199 500.
        $payout = PlatformPayout::query()->where('agency_id', $agency->id)->firstOrFail();
        $this->assertSame('210000.00', (string) $payout->gross_amount);
        $this->assertSame('10500.00', (string) $payout->platform_fee_amount);
        $this->assertSame('199500.00', (string) $payout->net_amount);

        $this->getJson("/api/admin/payouts/{$payout->id}")->assertOk()
            ->assertJsonPath('data.breakdown.lease.gross', 210000)
            ->assertJsonPath('data.breakdown.lease.fees', 10500);
    }

    public function test_ac3_mixed_currencies_are_refused_for_one_agency(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $this->soldeParLaPlateforme($this->bookingPayment($agency, 100_000));
        $this->soldeParLaPlateforme($this->bookingPayment($agency, 100, currency: 'EUR'));

        $this->close($agency)->assertStatus(422)->assertJsonPath('code', 'payout.mixed_currencies');
        $this->assertSame(0, PlatformPayout::query()->count());
        $this->assertSame(0, BookingPayment::query()->whereNotNull('platform_payout_id')->count());
    }

    public function test_ac3_mixed_currencies_exclude_the_agency_from_the_global_close(): void
    {
        $this->actingAsRole('super_admin');
        $mixed = Agency::factory()->create();
        $clean = Agency::factory()->create();
        $this->soldeParLaPlateforme($this->bookingPayment($mixed, 100_000));
        $this->soldeParLaPlateforme($this->leasePayment($mixed, 100, currency: 'EUR'));
        $this->soldeParLaPlateforme($this->bookingPayment($clean, 100_000));

        $response = $this->postJson('/api/admin/payouts/close-period', ['period_end' => '2026-09-30'])->assertCreated();

        $this->assertSame([$clean->id], array_column($response->json('data'), 'agency_id'));
        $this->assertContains(['agency_id' => $mixed->id, 'reason' => 'mixed_currencies'], $response->json('excluded'));
        $this->assertSame(0, PlatformPayout::query()->where('agency_id', $mixed->id)->count());
    }

    public function test_a_single_foreign_currency_keeps_its_currency(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $this->soldeParLaPlateforme($this->bookingPayment($agency, 150, currency: 'EUR'));

        $this->close($agency)->assertCreated();

        $this->assertSame('EUR', PlatformPayout::query()->firstOrFail()->getRawOriginal('currency'));
    }

    /**
     * Un loyer réglé en espèces pendant qu'un checkout de la plateforme était ouvert garde ce
     * checkout dans son historique, sans `settled_by` : rien n'est passé par la plateforme.
     */
    public function test_ac1_an_open_platform_checkout_without_settlement_is_not_reversed(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $cash = $this->soldeParLaPlateforme($this->leasePayment($agency, 80_000));
        $meta = $cash->metadata;
        unset($meta['gateway']['settled_by']);
        $cash->forceFill(['metadata' => $meta])->save();

        $this->postJson('/api/admin/payouts/close-period', ['period_end' => '2026-09-30'])->assertCreated();

        $this->assertSame(0, PlatformPayout::query()->count());
        $this->assertNull($cash->fresh()->platform_payout_id);
    }

    private function close(Agency $agency): TestResponse
    {
        return $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $agency->id,
            'period_end' => '2026-09-30',
        ]);
    }

    private function subscribe(Agency $agency, float $feePct): AgencySubscription
    {
        $plan = Plan::query()->create([
            'code' => 'plan-'.uniqid(),
            'label' => 'Test Plan',
            'monthly_price_xof' => 0,
            'platform_fee_pct' => $feePct,
            'trial_days' => 0,
            'limits' => [],
            'is_active' => true,
            'sort_order' => 0,
        ]);

        return AgencySubscription::query()->create([
            'agency_id' => $agency->id,
            'plan_id' => $plan->id,
            'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => now()->subYear(),
            'current_period_end' => now()->addYear(),
        ]);
    }

    private function bookingPayment(Agency $agency, int $amount, string $currency = 'XOF'): BookingPayment
    {
        $booking = Booking::factory()->create([
            'property_id' => Property::factory()->create(['agency_id' => $agency->id])->id,
            'agency_id' => $agency->id,
        ]);

        return BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => $amount,
            'currency' => $currency,
            'status' => PaymentStatus::Paid,
            'paid_at' => self::PAID_AT,
        ]);
    }

    private function leasePayment(Agency $agency, int $amount, string $currency = 'XOF'): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => Lease::factory()->create(['agency_id' => $agency->id])->id,
            'amount' => $amount,
            'currency' => $currency,
            'status' => PaymentStatus::Paid,
            'paid_at' => self::PAID_AT,
        ]);
    }
}
