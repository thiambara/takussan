<?php

namespace Tests\Feature\Jobs;

use App\Jobs\Booking\ExpirePendingBookingsJob;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Property;
use App\Models\User;
use App\Services\Booking\BookingExpirationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ExpirePendingBookingsJobTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    /**
     * SCENARIO 1: Happy path — pending booking created past threshold gets expired.
     */
    public function test_expires_pending_bookings_past_threshold(): void
    {
        $agency = Agency::factory()->create([
            'settings' => ['booking_pending_expiry_hours' => 48],
        ]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);
        $customer->user()->associate(User::factory()->create(['agency_id' => $agency->id]))->save();

        // Create a pending booking created 49 hours ago (past the 48h threshold)
        $booking = Booking::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => $property->id,
            'customer_id' => $customer->id,
            'status' => BookingStatus::Pending,
            'created_at' => now()->subHours(49),
        ]);

        $job = new ExpirePendingBookingsJob;
        app()->call([$job, 'handle']);

        $booking->refresh();
        $this->assertSame(BookingStatus::Expired, $booking->status);
        $this->assertNotNull($booking->expired_at);
        $this->assertSame('auto', $booking->expiry_reason);
    }

    /**
     * SCENARIO 2: Idempotence — confirmed, cancelled, or already expired bookings are ignored.
     */
    public function test_does_not_expire_non_pending_bookings(): void
    {
        $agency = Agency::factory()->create([
            'settings' => ['booking_pending_expiry_hours' => 24],
        ]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);

        // Confirmed booking (old)
        $confirmedBooking = Booking::factory()->confirmed()->create([
            'agency_id' => $agency->id,
            'property_id' => $property->id,
            'created_at' => now()->subDays(5),
        ]);

        // Cancelled booking (old)
        $cancelledBooking = Booking::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => $property->id,
            'status' => BookingStatus::Cancelled,
            'cancelled_at' => now()->subDays(3),
            'created_at' => now()->subDays(5),
        ]);

        // Already expired booking (old)
        $expiredBooking = Booking::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => $property->id,
            'status' => BookingStatus::Expired,
            'expired_at' => now()->subDays(2),
            'expiry_reason' => 'auto',
            'created_at' => now()->subDays(5),
        ]);

        $job = new ExpirePendingBookingsJob;
        app()->call([$job, 'handle']);

        $this->assertSame(BookingStatus::Confirmed, $confirmedBooking->fresh()->status);
        $this->assertNull($confirmedBooking->fresh()->expired_at);

        $this->assertSame(BookingStatus::Cancelled, $cancelledBooking->fresh()->status);
        $this->assertNull($cancelledBooking->fresh()->expired_at);

        $this->assertSame(BookingStatus::Expired, $expiredBooking->fresh()->status);
        $this->assertNotNull($expiredBooking->fresh()->expired_at);
        $this->assertSame('auto', $expiredBooking->fresh()->expiry_reason);
    }

    /**
     * SCENARIO 3: Opt-out — when booking_pending_expiry_hours = 0, auto-expiration is disabled.
     */
    public function test_respects_opt_out_when_threshold_is_zero(): void
    {
        $agency = Agency::factory()->create([
            'settings' => ['booking_pending_expiry_hours' => 0], // Disabled
        ]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);

        // Old pending booking that would normally be expired
        $booking = Booking::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => $property->id,
            'status' => BookingStatus::Pending,
            'created_at' => now()->subDays(30), // Very old
        ]);

        $job = new ExpirePendingBookingsJob;
        app()->call([$job, 'handle']);

        $booking->refresh();
        $this->assertSame(BookingStatus::Pending, $booking->status);
        $this->assertNull($booking->expired_at);
    }

    /**
     * SCENARIO 4: Batching — respects batch size limit (100 per execution).
     */
    public function test_respects_batch_size_limit(): void
    {
        $agency = Agency::factory()->create([
            'settings' => ['booking_pending_expiry_hours' => 24],
        ]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);

        // Create 110 old pending bookings
        $bookings = [];
        for ($i = 0; $i < 110; $i++) {
            $bookings[] = Booking::factory()->create([
                'agency_id' => $agency->id,
                'property_id' => $property->id,
                'status' => BookingStatus::Pending,
                'created_at' => now()->subDays(2),
            ]);
        }

        $job = new ExpirePendingBookingsJob;
        app()->call([$job, 'handle']);

        // Count expired bookings
        $expiredCount = Booking::whereIn('id', collect($bookings)->pluck('id'))
            ->where('status', BookingStatus::Expired)
            ->count();

        // Should be limited to batch size (100)
        $this->assertSame(100, $expiredCount);

        // Remaining should still be pending
        $pendingCount = Booking::whereIn('id', collect($bookings)->pluck('id'))
            ->where('status', BookingStatus::Pending)
            ->count();

        $this->assertSame(10, $pendingCount);
    }

    /**
     * SCENARIO 5: Lock — concurrent executions are prevented.
     */
    public function test_concurrent_execution_is_prevented_by_lock(): void
    {
        $agency = Agency::factory()->create([
            'settings' => ['booking_pending_expiry_hours' => 24],
        ]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);

        Booking::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => $property->id,
            'status' => BookingStatus::Pending,
            'created_at' => now()->subDays(2),
        ]);

        // Acquire the lock manually to simulate another job running
        $lock = Cache::lock(BookingExpirationService::LOCK_KEY, 600);
        $this->assertTrue($lock->get());

        try {
            $service = app(BookingExpirationService::class);
            $result = $service->expirePendingBookings();

            // Should report that it couldn't acquire lock
            $this->assertSame(0, $result['expired_count']);
            $this->assertContains('Could not acquire lock', $result['errors']);
        } finally {
            $lock->release();
        }
    }

    /**
     * Additional: Recent pending bookings (within threshold) are not expired.
     */
    public function test_does_not_expire_recent_pending_bookings(): void
    {
        $agency = Agency::factory()->create([
            'settings' => ['booking_pending_expiry_hours' => 48],
        ]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);

        // Recent booking (only 1 hour old, threshold is 48)
        $recentBooking = Booking::factory()->create([
            'agency_id' => $agency->id,
            'property_id' => $property->id,
            'status' => BookingStatus::Pending,
            'created_at' => now()->subHour(),
        ]);

        $job = new ExpirePendingBookingsJob;
        app()->call([$job, 'handle']);

        $recentBooking->refresh();
        $this->assertSame(BookingStatus::Pending, $recentBooking->status);
        $this->assertNull($recentBooking->expired_at);
    }
}
