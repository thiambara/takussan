<?php

namespace Tests\Feature\Jobs;

use App\Jobs\ExpireBookings;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\User;
use App\Notifications\BookingExpiredNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * TCK-596 (AC22) — l'expiration à l'échéance propre passe par la voie unique du service.
 * `ExpireBookings` faisait un `update` de masse du seul statut : `expired_at` restait nul, rien
 * n'était journalisé, et le client ne l'apprenait jamais.
 */
class ExpireBookingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_past_deadline_expires_through_the_service_and_tells_the_client(): void
    {
        Notification::fake();
        $client = User::factory()->create();
        $booking = Booking::factory()->create([
            'customer_id' => Customer::factory()->create(['user_id' => $client->id])->id,
            'status' => BookingStatus::Pending,
            'expires_at' => now()->subHour(),
        ]);

        (new ExpireBookings)->handle();

        $booking->refresh();
        $this->assertSame(BookingStatus::Expired, $booking->status);
        $this->assertNotNull($booking->expired_at);
        $this->assertSame('deadline', $booking->expiry_reason);
        Notification::assertSentTo($client, BookingExpiredNotification::class);
        $this->assertDatabaseHas('activity_log', [
            'subject_type' => $booking->getMorphClass(),
            'subject_id' => $booking->id,
            'description' => 'booking_expired',
        ]);
    }

    public function test_a_future_deadline_and_a_closed_booking_are_left_alone(): void
    {
        Notification::fake();
        $future = Booking::factory()->create(['status' => BookingStatus::Pending, 'expires_at' => now()->addHour()]);
        $cancelled = Booking::factory()->create(['status' => BookingStatus::Cancelled, 'expires_at' => now()->subHour()]);

        (new ExpireBookings)->handle();

        $this->assertSame(BookingStatus::Pending, $future->fresh()->status);
        $this->assertSame(BookingStatus::Cancelled, $cancelled->fresh()->status);
        $this->assertNull($cancelled->fresh()->expired_at);
        Notification::assertNothingSent();
    }
}
