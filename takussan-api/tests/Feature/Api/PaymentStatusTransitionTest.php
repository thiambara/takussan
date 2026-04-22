<?php

namespace Tests\Feature\Api;

use App\Models\BookingPayment;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Invoice;
use App\Models\LeasePayment;
use App\Models\Payout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * Verifies that terminal payment/invoice/payout statuses cannot revert to
 * open states. The guard lives on the models (`booted()` / trait boot).
 */
class PaymentStatusTransitionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Asserts that the given closure throws an HttpException with the given
     * HTTP status code (not the PHP exception "code" field).
     */
    protected function assertHttpException(int $expectedStatus, \Closure $callback): void
    {
        try {
            $callback();
        } catch (HttpException $e) {
            $this->assertSame($expectedStatus, $e->getStatusCode(), sprintf(
                'Expected HTTP %d, got HTTP %d (%s).',
                $expectedStatus,
                $e->getStatusCode(),
                $e->getMessage(),
            ));

            return;
        }

        $this->fail(sprintf('Expected HttpException with status %d, none thrown.', $expectedStatus));
    }

    public function test_booking_payment_cannot_revert_paid_to_pending(): void
    {
        $payment = BookingPayment::factory()->paid()->create();

        $this->assertHttpException(422, function () use ($payment): void {
            $payment->update(['status' => PaymentStatus::Pending]);
        });
    }

    public function test_booking_payment_can_transition_paid_to_refunded(): void
    {
        $payment = BookingPayment::factory()->paid()->create(['amount' => 100_000]);

        $payment->update([
            'status' => PaymentStatus::Refunded,
            'refund_amount' => 100_000,
        ]);

        $this->assertSame(PaymentStatus::Refunded, $payment->fresh()->status);
    }

    public function test_booking_payment_refunded_cannot_revert_to_pending(): void
    {
        $payment = BookingPayment::factory()->paid()->create(['amount' => 50_000]);
        $payment->update([
            'status' => PaymentStatus::Refunded,
            'refund_amount' => 50_000,
        ]);

        $this->assertHttpException(422, function () use ($payment): void {
            $payment->update(['status' => PaymentStatus::Pending]);
        });
    }

    public function test_lease_payment_cannot_revert_paid_to_pending(): void
    {
        $payment = LeasePayment::factory()->paid()->create();

        $this->assertHttpException(422, function () use ($payment): void {
            $payment->update(['status' => PaymentStatus::Pending]);
        });
    }

    public function test_lease_payment_can_transition_pending_to_paid(): void
    {
        $payment = LeasePayment::factory()->create(['status' => PaymentStatus::Pending]);

        $payment->update([
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
        ]);

        $this->assertSame(PaymentStatus::Paid, $payment->fresh()->status);
    }

    public function test_invoice_cannot_revert_paid_to_sent(): void
    {
        $invoice = Invoice::factory()->paid()->create();

        $this->assertHttpException(422, function () use ($invoice): void {
            $invoice->update(['status' => InvoiceStatus::Sent]);
        });
    }

    public function test_invoice_cannot_revert_paid_to_draft(): void
    {
        $invoice = Invoice::factory()->paid()->create();

        $this->assertHttpException(422, function () use ($invoice): void {
            $invoice->update(['status' => InvoiceStatus::Draft]);
        });
    }

    public function test_invoice_can_transition_sent_to_paid(): void
    {
        $invoice = Invoice::factory()->sent()->create();

        $invoice->update(['status' => InvoiceStatus::Paid]);

        $this->assertSame(InvoiceStatus::Paid, $invoice->fresh()->status);
    }

    public function test_payout_cannot_revert_completed_to_pending(): void
    {
        $payout = Payout::factory()->create(['status' => PayoutStatus::Completed]);

        $this->assertHttpException(422, function () use ($payout): void {
            $payout->update(['status' => PayoutStatus::Pending]);
        });
    }

    public function test_payout_cannot_revert_completed_to_scheduled(): void
    {
        $payout = Payout::factory()->create(['status' => PayoutStatus::Completed]);

        $this->assertHttpException(422, function () use ($payout): void {
            $payout->update(['status' => PayoutStatus::Scheduled]);
        });
    }

    public function test_payout_can_transition_pending_to_completed(): void
    {
        $payout = Payout::factory()->create(['status' => PayoutStatus::Pending]);

        $payout->update(['status' => PayoutStatus::Completed, 'processed_at' => now()]);

        $this->assertSame(PayoutStatus::Completed, $payout->fresh()->status);
    }

    public function test_booking_payment_accessors_return_expected_values(): void
    {
        $pending = BookingPayment::factory()->create([
            'status' => PaymentStatus::Pending,
            'amount' => 200_000,
        ]);
        $this->assertEquals(0.0, (float) $pending->paid_amount);
        $this->assertEquals(200_000.0, (float) $pending->remaining_amount);

        $paid = BookingPayment::factory()->paid()->create(['amount' => 150_000]);
        $this->assertEquals(150_000.0, (float) $paid->paid_amount);
        $this->assertEquals(0.0, (float) $paid->remaining_amount);

        // Partial via metadata.paid_amount accessor
        $partial = BookingPayment::factory()->create([
            'status' => PaymentStatus::PartiallyPaid,
            'amount' => 100_000,
            'metadata' => ['paid_amount' => 40_000],
        ]);
        $this->assertEquals(40_000.0, (float) $partial->paid_amount);
        $this->assertEquals(60_000.0, (float) $partial->remaining_amount);
    }
}
