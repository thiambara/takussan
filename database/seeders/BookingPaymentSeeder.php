<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\User;
use Illuminate\Database\Seeder;

class BookingPaymentSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get existing bookings
        $bookings = Booking::all();

        if ($bookings->isEmpty()) {
            // Create bookings if none exist
            $bookings = Booking::factory()->count(5)->create();
        }

        // Get users with appropriate roles
        $users = User::whereHas('assigned_roles', function ($query) {
            $query->whereIn('name', ['admin', 'agent', 'accountant']);
        })->get();

        if ($users->isEmpty()) {
            $users = [User::factory()->create()];
        }

        // Create deposits for each booking
        foreach ($bookings as $booking) {
            $user = $users->random();

            // Create a deposit payment
            BookingPayment::factory()
                ->deposit()
                ->confirmed()
                ->create([
                    'booking_id' => $booking->id,
                    'user_id' => $user->id,
                    'amount' => $booking->deposit_amount,
                    'payment_date' => $booking->deposit_date ?? now()->subDays(rand(1, 30)),
                ]);

            // Some bookings will have additional payments
            if (rand(0, 1)) {
                // Create 1-3 installment payments
                $paymentCount = rand(1, 3);
                for ($i = 0; $i < $paymentCount; $i++) {
                    BookingPayment::factory()
                        ->confirmed()
                        ->create([
                            'booking_id' => $booking->id,
                            'user_id' => $users->random()->id,
                            'payment_type' => 'installment',
                            'payment_date' => now()->subDays(rand(1, 15)),
                        ]);
                }
            }

            // Some bookings will have a final payment
            if (rand(0, 1)) {
                BookingPayment::factory()
                    ->confirmed()
                    ->create([
                        'booking_id' => $booking->id,
                        'user_id' => $users->random()->id,
                        'payment_type' => 'final_payment',
                        'payment_date' => now()->subDays(rand(0, 7)),
                    ]);
            }
        }

        // Create some pending payments
        BookingPayment::factory()
            ->count(3)
            ->state([
                'status' => 'pending',
                'booking_id' => $bookings->random()->id,
                'user_id' => $users->random()->id,
            ])
            ->create();
    }
}
