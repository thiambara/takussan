<?php

namespace App\Services\Model;

use App\Models\Booking;
use App\Models\BookingPayment;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Throwable;

class BookingPaymentService
{
    /**
     * Store a new booking payment
     * @throws Throwable
     */
    public function store(array $data): BookingPayment
    {
        // Set current user if not provided
        if (!isset($data['user_id'])) {
            $data['user_id'] = Auth::id();
        }

        return DB::transaction(function () use ($data) {
            $payment = BookingPayment::create($data);

            // If payment is a deposit and is confirmed, update the booking
            if ($payment->status === 'confirmed' && $payment->payment_type === 'deposit') {
                $booking = Booking::find($payment->booking_id);
                $booking?->update([
                    'deposit_paid' => true,
                    'deposit_date' => $payment->payment_date,
                ]);
            }

            return $payment;
        });
    }

    /**
     * Update an existing booking payment
     * @throws Throwable
     */
    public function update(BookingPayment $payment, array $data): BookingPayment
    {
        $oldStatus = $payment->status;
        $oldType = $payment->payment_type;

        return DB::transaction(function () use ($payment, $data, $oldStatus, $oldType) {
            $payment->update($data);

            // Handle deposit payment status changes
            if ($payment->payment_type === 'deposit' || $oldType === 'deposit') {
                $this->handleDepositStatusChange($payment, $oldStatus);
            }

            return $payment;
        });
    }

    /**
     * Handle deposit payment status changes
     *
     * @param BookingPayment $payment
     * @param string|null $oldStatus
     * @return void
     */
    protected function handleDepositStatusChange(BookingPayment $payment, ?string $oldStatus): void
    {
        if ($payment->payment_type === 'deposit') {
            $booking = Booking::find($payment->booking_id);

            if (!$booking) {
                return;
            }

            if ($payment->status === 'confirmed' && $oldStatus !== 'confirmed') {
                // Payment was confirmed - update booking
                $booking->update([
                    'deposit_paid' => true,
                    'deposit_date' => $payment->payment_date,
                ]);
            } elseif ($payment->status !== 'confirmed' && $oldStatus === 'confirmed') {
                // Payment was un-confirmed - check if there are other confirmed deposits
                $otherDeposits = BookingPayment::where('booking_id', $booking->id)
                    ->where('id', '!=', $payment->id)
                    ->where('payment_type', 'deposit')
                    ->where('status', 'confirmed')
                    ->exists();

                if (!$otherDeposits) {
                    $booking->update([
                        'deposit_paid' => false,
                        'deposit_date' => null,
                    ]);
                }
            }
        }
    }

    /**
     * Delete a booking payment
     * @throws Throwable
     */
    public function delete(BookingPayment $payment): bool
    {
        return DB::transaction(function () use ($payment) {
            // If this was a confirmed deposit payment, update the booking
            if ($payment->status === 'confirmed' && $payment->payment_type === 'deposit') {
                $booking = Booking::find($payment->booking_id);
                if ($booking && $booking->deposit_paid) {
                    // Check if there are other confirmed deposit payments
                    $otherDeposits = BookingPayment::where('booking_id', $booking->id)
                        ->where('id', '!=', $payment->id)
                        ->where('payment_type', 'deposit')
                        ->where('status', 'confirmed')
                        ->exists();

                    if (!$otherDeposits) {
                        $booking->update([
                            'deposit_paid' => false,
                            'deposit_date' => null,
                        ]);
                    }
                }
            }

            return $payment->delete();
        });
    }

    /**
     * Get payments for a booking
     *
     * @param int $bookingId
     * @return Collection
     */
    public function getPaymentsForBooking(int $bookingId): Collection
    {
        return BookingPayment::where('booking_id', $bookingId)
            ->with('user')
            ->orderBy('payment_date', 'desc')
            ->get();
    }
}
