<?php

namespace Database\Seeders;

use App\Models\Booking;
use App\Models\Notification;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Seeder;

class NotificationSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get users to create notifications for
        $users = User::all();

        if ($users->isEmpty()) {
            $users = [User::factory()->create()];
        }

        // Get properties for property notifications
        $properties = Property::all();

        if ($properties->isEmpty()) {
            $properties = [Property::factory()->create()];
        }

        // Get bookings for booking notifications
        $bookings = Booking::all();

        if ($bookings->isEmpty()) {
            $bookings = [Booking::factory()->create()];
        }

        // Create system notifications for all users
        foreach ($users as $user) {
            // Welcome notification
            Notification::factory()->create([
                'user_id' => $user->id,
                'type' => 'system',
                'title' => 'Welcome to Takussan',
                'content' => 'Welcome to Takussan, your real estate management platform. Start by exploring your dashboard.',
                'reference_id' => null,
                'reference_type' => null,
                'delivered' => true,
                'delivery_channel' => 'app',
                'delivered_at' => $user->created_at->addMinutes(1),
                'is_read' => fake()->boolean(70), // 70% chance to be read
            ]);

            // Account verification notification
            if ($user->email_verified_at) {
                Notification::factory()->create([
                    'user_id' => $user->id,
                    'type' => 'system',
                    'title' => 'Account Verified',
                    'content' => 'Your account has been successfully verified. You now have full access to all features.',
                    'reference_id' => null,
                    'reference_type' => null,
                    'delivered' => true,
                    'delivery_channel' => 'app',
                    'delivered_at' => $user->email_verified_at,
                    'is_read' => true,
                    'read_at' => $user->email_verified_at->addMinutes(fake()->numberBetween(1, 60)),
                ]);
            }

            // Create random unread notifications
            $unreadCount = fake()->numberBetween(0, 5);
            Notification::factory()
                ->count($unreadCount)
                ->unread()
                ->create([
                    'user_id' => $user->id,
                    'created_at' => fake()->dateTimeBetween('-7 days', 'now'),
                ]);

            // Create random read notifications
            $readCount = fake()->numberBetween(0, 10);
            Notification::factory()
                ->count($readCount)
                ->read()
                ->create([
                    'user_id' => $user->id,
                    'created_at' => fake()->dateTimeBetween('-30 days', '-7 days'),
                ]);
        }

        // Create property notifications
        foreach ($properties as $property) {
            if (!$property->user_id) continue;
            // Notify property owner about views
            Notification::factory()->create([
                'user_id' => $property->user_id,
                'type' => 'property',
                'title' => 'Property Getting Attention',
                'content' => 'Your property "' . $property->title . '" has been viewed 10 times in the last week.',
                'reference_id' => $property->id,
                'reference_type' => Property::class,
                'delivered' => true,
                'delivery_channel' => 'app',
                'delivered_at' => fake()->dateTimeBetween('-7 days', 'now'),
                'is_read' => fake()->boolean(50),
            ]);
        }

        // Create booking notifications
        foreach ($bookings as $booking) {
            if (!$booking->property->user_id) continue;
            // Notify property owner about booking
            Notification::factory()->create([
                'user_id' => $booking->property->user_id,
                'type' => 'booking',
                'title' => 'New Booking Request',
                'content' => 'You have received a new booking request for "' . $booking->property->title . '".',
                'reference_id' => $booking->id,
                'reference_type' => Booking::class,
                'delivered' => true,
                'delivery_channel' => 'app',
                'delivered_at' => $booking->created_at->addMinutes(fake()->numberBetween(1, 10)),
                'is_read' => fake()->boolean(80),
            ]);

            // Notify customer about booking status
            if ($booking->status->value !== 'pending') {
                if (!$booking->user_id) continue;
                Notification::factory()->create([
                    'user_id' => $booking->user_id,
                    'type' => 'booking',
                    'title' => 'Booking ' . ucfirst($booking->status->value),
                    'content' => 'Your booking for "' . $booking->property->title . '" has been ' . $booking->status->value . '.',
                    'reference_id' => $booking->id,
                    'reference_type' => Booking::class,
                    'delivered' => true,
                    'delivery_channel' => 'app',
                    'delivered_at' => fake()->dateTimeBetween($booking->created_at, 'now'),
                    'is_read' => fake()->boolean(90),
                ]);
            }
        }
    }
}
