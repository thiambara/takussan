<?php

namespace Database\Seeders;

use App\Models\Bases\Enums\UserRole;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

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
        $users = User::role([UserRole::Admin->value, UserRole::Vendor->value])->get();

        if ($users->isEmpty()) {
            // Make sure we still have a collection even if we need to create a user
            $users = new Collection([User::factory()->create()]);
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
                    'amount' => $booking->deposit_amount ?? fake()->randomFloat(2, 10000, 50000),
                    'payment_date' => $booking->deposit_date ?? now()->subDays(rand(1, 30)),
                ]);

            // Some bookings will have additional payments
            if (rand(0, 1)) {
                // Create 1-3 installment payments
                $installmentCount = rand(1, 3);
                
                for ($i = 0; $i < $installmentCount; $i++) {
                    $paymentDate = now()->subDays(rand(1, 20));
                    
                    BookingPayment::factory()
                        ->confirmed()
                        ->create([
                            'booking_id' => $booking->id,
                            'user_id' => $users->random()->id,
                            'payment_type' => 'installment',
                            'amount' => fake()->randomFloat(2, 15000, 100000),
                            'payment_date' => $paymentDate,
                        ]);
                }
            }
        }

        // Create some pending and failed payments
        $paymentStatuses = ['pending', 'failed'];
        
        foreach ($paymentStatuses as $status) {
            BookingPayment::factory()
                ->state([
                    'status' => $status,
                    'payment_type' => 'installment',
                ])
                ->count(2)
                ->create([
                    'booking_id' => $bookings->random()->id,
                    'user_id' => $users->random()->id,
                ]);
        }
    }
}
