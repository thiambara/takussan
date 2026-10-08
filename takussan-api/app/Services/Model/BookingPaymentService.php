<?php

namespace App\Services\Model;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\User;
use App\Services\Booking\BookingRefundTaskService;
use Illuminate\Support\Facades\DB;

class BookingPaymentService
{
    public function __construct(private readonly BookingRefundTaskService $refundTasks) {}

    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Booking $booking, User $user, array $data): BookingPayment
    {
        $status = (isset($data['status']) && $data['status'] !== null && $data['status'] !== '')
            ? $data['status']
            : PaymentStatus::Paid->value;
        // Only stamp `paid_at` when the row is actually paid; otherwise leave
        // it null so the payment shows as pending/partial/etc. correctly.
        $isPaid = $status === PaymentStatus::Paid->value
            || ($status instanceof PaymentStatus && $status === PaymentStatus::Paid);

        return $booking->payments()->create([
            'payer_id' => $booking->customer_id,
            'collector_id' => $user->id,
            'reference_number' => ReferenceNumberGenerator::bookingPayment(),
            'receipt_number' => ReferenceNumberGenerator::receipt(),
            'amount' => $data['amount'],
            'currency' => $booking->currency?->value ?? 'XOF',
            'payment_type' => $data['payment_type'],
            'payment_method' => $data['payment_method'] ?? null,
            'status' => $status instanceof PaymentStatus ? $status->value : $status,
            'paid_at' => $isPaid ? ($data['paid_at'] ?? now()) : ($data['paid_at'] ?? null),
            'transaction_id' => $data['transaction_id'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);
    }

    /**
     * TCK-596 — la ligne du paiement est verrouillée puis relue : deux remboursements concurrents
     * du même acompte ne passent pas tous deux le contrôle `paid`. Le dernier paiement remboursé
     * clôt la tâche « remboursement à traiter ».
     *
     * @param  array<string,mixed>  $data
     */
    public function refund(BookingPayment $payment, array $data): BookingPayment
    {
        $payment = DB::transaction(function () use ($payment, $data): BookingPayment {
            $payment = BookingPayment::query()->whereKey($payment->getKey())->lockForUpdate()->firstOrFail();

            abort_code_unless(
                $payment->status === PaymentStatus::Paid,
                422,
                'booking_payment.refund_unpaid'
            );

            abort_code_if(
                (float) $data['refund_amount'] > (float) $payment->amount,
                422,
                'booking_payment.refund_exceeds_paid'
            );

            // TCK-596 — une devise sans sous-unité (XOF) ne rembourse pas 1 000,50.
            $currency = $payment->currency instanceof Currency ? $payment->currency : Currency::XOF;
            abort_code_if(
                $currency->decimalPlaces() === 0 && preg_match('/^\d+(\.0+)?$/', (string) $data['refund_amount']) !== 1,
                422,
                'booking_payment.refund_fractional'
            );

            $payment->update([
                'status' => PaymentStatus::Refunded->value,
                'refund_amount' => $data['refund_amount'],
                'refund_reason' => $data['refund_reason'] ?? null,
            ]);

            return $payment->refresh();
        });

        $payment->loadMissing('booking');
        if ($payment->booking !== null) {
            $this->refundTasks->closeIfSettled($payment->booking);
        }

        return $payment;
    }
}
