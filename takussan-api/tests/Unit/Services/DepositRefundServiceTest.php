<?php

namespace Tests\Unit\Services;

use App\Events\Lease\LeaseDepositRefunded;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PayoutStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use App\Models\User;
use App\Services\Lease\DepositRefundService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * TCK-088 — invariants of the deposit refund flow exercised end-to-end
 * against the database, with the HTTP layer / policy bypassed. The 8
 * scenarios cover the full matrix of validation paths plus the side
 * effects (Payout outflow, retention Invoice, ActivityLog event).
 */
class DepositRefundServiceTest extends TestCase
{
    use RefreshDatabase;

    protected DepositRefundService $service;

    protected User $issuer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(DepositRefundService::class);
        $this->issuer = User::factory()->create();
    }

    public function test_full_refund_marks_lease_and_creates_payout(): void
    {
        Event::fake([LeaseDepositRefunded::class]);

        $lease = $this->lease(['deposit_amount' => 600000, 'status' => LeaseStatus::Terminated]);

        $result = $this->service->refund($lease, $this->issuer, ['amount' => 600000]);

        $this->assertSame(600000.0, (float) $result['lease']->deposit_refunded_amount);
        $this->assertNotNull($result['lease']->deposit_refunded_at);
        $this->assertSame(0.0, $result['lease']->deposit_remaining);

        $this->assertInstanceOf(Payout::class, $result['payout']);
        $this->assertSame(PayoutStatus::Pending, $result['payout']->status);
        $this->assertSame(600000.0, (float) $result['payout']->net_amount);
        $this->assertNull($result['invoice']);

        Event::assertDispatched(LeaseDepositRefunded::class);
    }

    public function test_partial_refund_creates_retention_invoice(): void
    {
        $lease = $this->lease(['deposit_amount' => 600000, 'status' => LeaseStatus::Terminated]);

        $result = $this->service->refund($lease, $this->issuer, [
            'amount' => 400000,
            'reason' => 'Réparations cuisine',
        ]);

        $this->assertSame(400000.0, (float) $result['lease']->deposit_refunded_amount);
        $this->assertSame(200000.0, $result['lease']->deposit_remaining);
        $this->assertInstanceOf(Invoice::class, $result['invoice']);
        $this->assertSame(200000.0, (float) $result['invoice']->total_amount);
        $this->assertStringContainsString('Réparations cuisine', $result['invoice']->notes);
    }

    public function test_partial_refund_without_reason_is_rejected(): void
    {
        $lease = $this->lease(['deposit_amount' => 600000, 'status' => LeaseStatus::Terminated]);

        $this->assertAborts422(fn () => $this->service->refund($lease, $this->issuer, ['amount' => 100000]));
    }

    public function test_refund_on_active_lease_is_rejected(): void
    {
        $lease = $this->lease(['deposit_amount' => 600000, 'status' => LeaseStatus::Active]);

        $this->assertAborts422(fn () => $this->service->refund($lease, $this->issuer, ['amount' => 600000]));
    }

    public function test_refund_amount_exceeding_remaining_is_rejected(): void
    {
        $lease = $this->lease(['deposit_amount' => 600000, 'status' => LeaseStatus::Terminated]);

        $this->assertAborts422(fn () => $this->service->refund($lease, $this->issuer, ['amount' => 600001]));
    }

    public function test_full_refund_then_second_call_is_rejected(): void
    {
        $lease = $this->lease(['deposit_amount' => 600000, 'status' => LeaseStatus::Terminated]);

        $this->service->refund($lease, $this->issuer, ['amount' => 600000]);

        $this->assertAborts422(fn () => $this->service->refund($lease->fresh(), $this->issuer, ['amount' => 1]));
    }

    public function test_partial_then_topup_consumes_remaining(): void
    {
        $lease = $this->lease(['deposit_amount' => 600000, 'status' => LeaseStatus::Terminated]);

        $this->service->refund($lease, $this->issuer, ['amount' => 400000, 'reason' => 'A']);
        $result = $this->service->refund($lease->fresh(), $this->issuer, ['amount' => 200000]);

        $this->assertSame(600000.0, (float) $result['lease']->deposit_refunded_amount);
        $this->assertSame(0.0, $result['lease']->deposit_remaining);
        $this->assertSame(2, LeasePayment::query()->where('lease_id', $lease->id)->count());
    }

    public function test_refund_writes_activity_log_entry(): void
    {
        $lease = $this->lease(['deposit_amount' => 600000, 'status' => LeaseStatus::Terminated]);

        $this->service->refund($lease, $this->issuer, [
            'amount' => 500000,
            'reason' => 'Repeinture salon',
        ]);

        $this->assertDatabaseHas('activity_log', [
            'log_name' => 'Lease',
            'event' => 'deposit_refunded',
            'subject_id' => $lease->id,
        ]);
    }

    /** @param array<string,mixed> $overrides */
    protected function lease(array $overrides = []): Lease
    {
        return Lease::factory()->create(array_merge([
            'landlord_id' => $this->issuer->id,
            'agency_id' => $this->issuer->agency_id,
            'type' => LeaseType::ResidentialRent,
            'payment_frequency' => PaymentFrequency::Monthly,
            'monthly_rent' => 200000,
        ], $overrides));
    }

    /**
     * `abort(422)` throws a Symfony HttpException whose `getCode()` is 0
     * — the HTTP status sits in `getStatusCode()`. Wrapping the call in a
     * helper avoids re-typing the dance in every test.
     */
    protected function assertAborts422(callable $closure): void
    {
        try {
            $closure();
            $this->fail('Expected HttpException with status 422, none thrown.');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
    }
}
