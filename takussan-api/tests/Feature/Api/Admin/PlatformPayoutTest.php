<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Plan;
use App\Models\PlatformPayout;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

class PlatformPayoutTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_close_period_aggregates_paid_payments_and_freezes_fee(): void
    {
        $actor = $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $this->subscribe($agency, feePct: 5);

        // Two booking payments at fee=5%, one paid before period_end, one after.
        $payment1 = $this->bookingPayment($agency, amount: 100_000, paidAt: '2026-04-15 10:00:00');
        $payment2 = $this->bookingPayment($agency, amount: 200_000, paidAt: '2026-05-01 10:00:00');
        $this->bookingPayment($agency, amount: 999_999, paidAt: '2026-06-01 10:00:00'); // out of window

        $this->assertSame('5.00', $payment1->refresh()->platform_fee_pct_at_payment);
        $this->assertSame('5.00', $payment2->refresh()->platform_fee_pct_at_payment);

        $response = $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $agency->id,
            'period_end' => '2026-05-31',
        ])->assertCreated();

        $payouts = $response->json('data');
        $this->assertCount(1, $payouts);
        $payout = PlatformPayout::query()->firstOrFail();

        // gross = 300_000 ; fee = 5% × 300_000 = 15_000 ; net = 285_000.
        $this->assertSame('300000.00', (string) $payout->gross_amount);
        $this->assertSame('15000.00', (string) $payout->platform_fee_amount);
        $this->assertSame('285000.00', (string) $payout->net_amount);
        $this->assertSame(PlatformPayoutStatus::Pending, $payout->status);
        $this->assertSame(2, BookingPayment::query()->where('platform_payout_id', $payout->id)->count());

        $this->assertTrue(Activity::query()
            ->where('event', 'super_admin_payout_period_closed')
            ->where('causer_id', $actor->id)
            ->exists());
    }

    public function test_close_period_is_idempotent_and_returns_409_on_replay(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $this->subscribe($agency, feePct: 2);
        $this->bookingPayment($agency, amount: 100_000, paidAt: '2026-05-15 10:00:00');

        $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $agency->id,
            'period_end' => '2026-05-31',
        ])->assertCreated();

        $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $agency->id,
            'period_end' => '2026-05-31',
        ])->assertStatus(409);

        $this->assertSame(1, PlatformPayout::query()->count());
    }

    public function test_invalid_status_transition_returns_422(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $payout = PlatformPayout::factory()->paid()->create(['agency_id' => $agency->id]);

        $this->postJson("/api/admin/payouts/{$payout->id}/approve")
            ->assertStatus(422);
    }

    public function test_full_happy_path_pending_to_paid(): void
    {
        $actor = $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $payout = PlatformPayout::factory()->create(['agency_id' => $agency->id]);

        $this->postJson("/api/admin/payouts/{$payout->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', PlatformPayoutStatus::Approved->value)
            ->assertJsonPath('data.approved_by', $actor->id);

        $this->postJson("/api/admin/payouts/{$payout->id}/mark-paid", [
            'processed_at' => '2026-05-15T12:00:00Z',
            'metadata' => ['bank_ref' => 'WIRE-42'],
        ])
            ->assertOk()
            ->assertJsonPath('data.status', PlatformPayoutStatus::Paid->value);

        $this->assertTrue(Activity::query()->where('event', 'super_admin_payout_approved')->exists());
        $this->assertTrue(Activity::query()->where('event', 'super_admin_payout_marked_paid')->exists());
    }

    public function test_cancel_releases_attached_payments(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $this->subscribe($agency, feePct: 5);
        $this->bookingPayment($agency, amount: 100_000, paidAt: '2026-05-15 10:00:00');

        $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $agency->id,
            'period_end' => '2026-05-31',
        ])->assertCreated();

        $payout = PlatformPayout::query()->firstOrFail();
        $this->assertSame(1, BookingPayment::query()->where('platform_payout_id', $payout->id)->count());

        $this->postJson("/api/admin/payouts/{$payout->id}/cancel", [
            'reason' => 'Erreur de période',
        ])->assertOk()->assertJsonPath('data.status', PlatformPayoutStatus::Cancelled->value);

        $this->assertSame(0, BookingPayment::query()->where('platform_payout_id', $payout->id)->count());

        // After cancel, the same period can be re-closed with the released payments.
        $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $agency->id,
            'period_end' => '2026-05-31',
        ])->assertCreated();
    }

    public function test_breakdown_uses_bounded_query_count(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $this->subscribe($agency, feePct: 4);

        for ($i = 0; $i < 5; $i++) {
            $this->bookingPayment($agency, amount: 10_000 * ($i + 1), paidAt: '2026-05-15 10:00:00');
            $this->leasePayment($agency, amount: 20_000 * ($i + 1), paidAt: '2026-05-15 10:00:00');
        }

        $this->postJson('/api/admin/payouts/close-period', [
            'agency_id' => $agency->id,
            'period_end' => '2026-05-31',
        ])->assertCreated();

        $payout = PlatformPayout::query()->firstOrFail();

        DB::enableQueryLog();
        DB::flushQueryLog();

        $response = $this->getJson("/api/admin/payouts/{$payout->id}")->assertOk();

        $aggregateQueries = collect(DB::getQueryLog())
            ->filter(fn ($q) => str_contains($q['query'], 'COUNT(*)') && str_contains($q['query'], 'platform_fee_pct_at_payment'))
            ->count();

        DB::disableQueryLog();

        $this->assertLessThanOrEqual(2, $aggregateQueries, 'Breakdown must run in ≤ 2 aggregate queries.');
        $this->assertSame(5, $response->json('data.breakdown.booking.count'));
        $this->assertSame(5, $response->json('data.breakdown.lease.count'));
    }

    public function test_agency_admin_is_forbidden_on_admin_endpoints(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $payout = PlatformPayout::factory()->create(['agency_id' => $agency->id]);

        $this->getJson('/api/admin/payouts')->assertForbidden();
        $this->postJson('/api/admin/payouts/close-period', [
            'period_end' => '2026-05-31',
        ])->assertForbidden();
        $this->postJson("/api/admin/payouts/{$payout->id}/approve")->assertForbidden();
        $this->postJson("/api/admin/payouts/{$payout->id}/mark-paid", [
            'processed_at' => '2026-05-15T12:00:00Z',
        ])->assertForbidden();
    }

    public function test_agency_admin_can_read_their_own_payouts_via_me_endpoint(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $mine = PlatformPayout::factory()->create(['agency_id' => $agency->id]);
        $other = PlatformPayout::factory()->create(['agency_id' => Agency::factory()->create()->id]);

        $response = $this->getJson('/api/me/payouts')->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($mine->id, $ids);
        $this->assertNotContains($other->id, $ids);
    }

    private function subscribe(Agency $agency, float $feePct = 0): AgencySubscription
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
            'current_period_start' => now()->subMonth(),
            'current_period_end' => now()->addMonth(),
        ]);
    }

    private function bookingPayment(Agency $agency, int $amount, string $paidAt): BookingPayment
    {
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'agency_id' => $agency->id,
        ]);

        return BookingPayment::factory()->create([
            'booking_id' => $booking->id,
            'amount' => $amount,
            'status' => PaymentStatus::Paid,
            'paid_at' => $paidAt,
        ]);
    }

    private function leasePayment(Agency $agency, int $amount, string $paidAt): LeasePayment
    {
        $lease = Lease::factory()->create(['agency_id' => $agency->id]);

        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => $amount,
            'status' => PaymentStatus::Paid,
            'paid_at' => $paidAt,
        ]);
    }
}
