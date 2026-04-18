<?php

namespace Database\Seeders\Activity;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use Database\Seeders\Support\SeedingContext;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class BookingPaymentSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        Booking::whereIn('status', [
            BookingStatus::Completed->value,
            BookingStatus::Confirmed->value,
        ])->chunkById(100, function ($bookings) {
            foreach ($bookings as $booking) {
                $depositAmount = (int) ($booking->deposit_amount ?: $booking->total_amount * 0.3);
                $paidAt = ($booking->confirmed_at ?? $booking->created_at);

                BookingPayment::create([
                    'booking_id' => $booking->id,
                    'payer_id' => $booking->customer_id,
                    'reference_number' => 'BPY-'.strtoupper(Str::random(6)),
                    'amount' => $depositAmount,
                    'currency' => 'XOF',
                    'payment_method' => PaymentMethod::Wave->value,
                    'payment_type' => BookingPaymentType::Deposit->value,
                    'status' => PaymentStatus::Paid->value,
                    'paid_at' => $paidAt,
                    'transaction_id' => 'TX-'.strtoupper(Str::random(10)),
                    'created_at' => $paidAt,
                    'updated_at' => $paidAt,
                ]);

                if ($booking->status === BookingStatus::Completed) {
                    $balance = (int) ($booking->total_amount - $depositAmount);
                    if ($balance > 0) {
                        $finalPaid = $booking->end_date ?: $paidAt;
                        BookingPayment::create([
                            'booking_id' => $booking->id,
                            'payer_id' => $booking->customer_id,
                            'reference_number' => 'BPY-'.strtoupper(Str::random(6)),
                            'amount' => $balance,
                            'currency' => 'XOF',
                            'payment_method' => PaymentMethod::Wave->value,
                            'payment_type' => BookingPaymentType::Advance->value,
                            'status' => PaymentStatus::Paid->value,
                            'paid_at' => $finalPaid,
                            'transaction_id' => 'TX-'.strtoupper(Str::random(10)),
                            'created_at' => $finalPaid,
                            'updated_at' => $finalPaid,
                        ]);
                    }
                }
            }
        });
    }
}
