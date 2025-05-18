<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Property;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class BookingSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get available users with admin or manager roles
        $users = User::whereHas('assigned_roles', function ($query) {
            $query->whereIn('code', ['admin', 'manager']);
        })->get();

        if ($users->isEmpty()) {
            $users = User::take(2)->get();
        }

        // Get available properties that are rentable
        $rentableProperties = Property::where('status', 'available')
            ->where('contract_type', 'rent')
            ->get();

        // If no rentable properties, get some available properties
        if ($rentableProperties->isEmpty()) {
            $rentableProperties = Property::where('status', 'available')->get();
        }

        // Get available customers
        $customers = Customer::where('status', 'active')->get();

        // If any of the required models are empty, we can't proceed with creating bookings
        if ($users->isEmpty() || $rentableProperties->isEmpty() || $customers->isEmpty()) {
            return;
        }

        // Create bookings for each status type
        $statuses = ['pending', 'confirmed', 'completed', 'cancelled'];
        
        foreach ($statuses as $status) {
            // Current date for reference
            $now = Carbon::now();
            
            // Create a few bookings with different date ranges based on status
            for ($i = 0; $i < 2; $i++) {
                $customer = $customers->random();
                $property = $rentableProperties->random();
                $user = $users->random();
                
                // Set start and end dates based on booking status
                switch ($status) {
                    case 'pending':
                        $startDate = $now->copy()->addDays(rand(5, 30));
                        $endDate = $startDate->copy()->addDays(rand(3, 14));
                        break;
                    case 'confirmed':
                        $startDate = $now->copy()->addDays(rand(2, 20));
                        $endDate = $startDate->copy()->addDays(rand(3, 14));
                        break;
                    case 'completed':
                        $startDate = $now->copy()->subDays(rand(30, 60));
                        $endDate = $startDate->copy()->addDays(rand(3, 14));
                        break;
                    case 'cancelled':
                        $startDate = $now->copy()->subDays(rand(5, 20));
                        $endDate = $startDate->copy()->addDays(rand(3, 7));
                        break;
                    default:
                        $startDate = $now->copy()->addDays(rand(1, 30));
                        $endDate = $startDate->copy()->addDays(rand(3, 14));
                }
                
                // Calculate price based on property price and booking duration
                $duration = $startDate->diffInDays($endDate);
                $price = $property->price * $duration;
                
                // Create the booking
                Booking::create([
                    'customer_id' => $customer->id,
                    'property_id' => $property->id,  // Using the correct column name from the schema
                    'user_id' => $user->id,
                    'reference_number' => 'BK-' . strtoupper(fake()->bothify('??###')),
                    'status' => $status,
                    'booking_date' => $now,
                    'price_at_booking' => $price,
                    'notes' => $status === 'cancelled' 
                        ? 'Booking cancelled due to ' . fake()->randomElement(['customer request', 'payment issues', 'property unavailability'])
                        : fake()->optional(0.7)->paragraph(),
                    'metadata' => [
                        'booking_channel' => fake()->randomElement(['website', 'phone', 'office', 'agent']),
                        'special_requests' => $status !== 'cancelled' ? fake()->optional(0.3)->sentence() : null
                    ]
                ]);
            }
        }
        
        // Create a few upcoming bookings for the next month
        for ($i = 0; $i < 3; $i++) {
            $customer = $customers->random();
            $property = $rentableProperties->random();
            $user = $users->random();
            
            $startDate = $now->copy()->addDays(rand(30, 60));
            $endDate = $startDate->copy()->addDays(rand(3, 14));
            
            Booking::create([
                'customer_id' => $customer->id,
                'property_id' => $property->id,  // Using the correct column name from the schema
                'user_id' => $user->id,
                'reference_number' => 'BK-' . strtoupper(fake()->bothify('??###')),
                'status' => 'confirmed',
                'booking_date' => $now,
                'price_at_booking' => $property->price * $startDate->diffInDays($endDate),
                'notes' => fake()->optional(0.7)->paragraph(),
                'metadata' => [
                    'booking_channel' => fake()->randomElement(['website', 'phone', 'office', 'agent']),
                    'special_requests' => fake()->optional(0.3)->sentence()
                ]
            ]);
        }
    }
}
