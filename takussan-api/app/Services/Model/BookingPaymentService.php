<?php

namespace App\Services\Model;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\PaymentStatus;
use App\Models\User;

class BookingPaymentService
{
    /**
     * @param  array<string,mixed>  $data
     */
    public function create(Booking $booking, User $user, array $data): BookingPayment
    {
        return $booking->payments()->create([
            'payer_id' => $booking->customer_id,
            'collector_id' => $user->id,
            'reference_number' => ReferenceNumberGenerator::bookingPayment(),
            'receipt_number' => ReferenceNumberGenerator::receipt(),
            'amount' => $data['amount'],
            'currency' => $booking->currency?->value ?? 'XOF',
            'payment_type' => $data['payment_type'],
            'payment_method' => $data['payment_method'] ?? null,
            'status' => PaymentStatus::Paid->value,
            'paid_at' => $data['paid_at'] ?? now(),
            'transaction_id' => $data['transaction_id'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);
    }

    /**
     * @param  array<string,mixed>  $data
     */
    public function refund(BookingPayment $payment, array $data): BookingPayment
    {
        abort_unless(
            $payment->status === PaymentStatus::Paid,
            422,
            'Only paid payments can be refunded.'
        );

        abort_if(
            (float) $data['refund_amount'] > (float) $payment->amount,
            422,
            'Refund amount cannot exceed the paid amount.'
        );

        $payment->update([
            'status' => PaymentStatus::Refunded->value,
            'refund_amount' => $data['refund_amount'],
            'refund_reason' => $data['refund_reason'] ?? null,
        ]);

        return $payment->refresh();
    }
}
