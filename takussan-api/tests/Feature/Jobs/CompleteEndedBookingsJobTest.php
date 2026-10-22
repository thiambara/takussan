<?php

namespace Tests\Feature\Jobs;

use App\Events\Booking\BookingClosed;
use App\Jobs\Booking\CompleteEndedBookingsJob;
use App\Models\Enums\BookingStatus;
use App\Models\Task;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event as EventFacade;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1301 (P115.01) — rien n'écrivait `completed` : une réservation `confirmed` le restait après
 * son séjour, et restait annulable, avec une tâche de remboursement de l'acompte. Une tâche
 * quotidienne passe `completed` les réservations `confirmed` dont la date de fin est passée, et
 * `cancel()` refuse l'annulation d'un séjour commencé.
 */
class CompleteEndedBookingsJobTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Carbon::setTestNow('2026-11-02 03:30:00');
        $this->buildStakeholders();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_une_reservation_confirmee_au_sejour_fini_passe_completed_et_seulement_elle(): void
    {
        $ended = $this->bookingOfClient(['status' => BookingStatus::Confirmed, 'start_date' => '2026-10-23', 'end_date' => '2026-11-01']);
        $endsToday = $this->bookingOfClient(['status' => BookingStatus::Confirmed, 'start_date' => '2026-10-30', 'end_date' => '2026-11-02']);
        $future = $this->bookingOfClient(['status' => BookingStatus::Confirmed, 'start_date' => '2026-11-10', 'end_date' => '2026-11-12']);
        $pending = $this->bookingOfClient(['status' => BookingStatus::Pending, 'start_date' => '2026-10-23', 'end_date' => '2026-11-01']);
        $undated = $this->bookingOfClient(['status' => BookingStatus::Confirmed, 'start_date' => null, 'end_date' => null]);

        EventFacade::fake([BookingClosed::class]);

        $this->assertSame(1, (new CompleteEndedBookingsJob)->handle());

        $this->assertSame(BookingStatus::Completed, $ended->fresh()->status);
        $this->assertSame(BookingStatus::Confirmed, $endsToday->fresh()->status);
        $this->assertSame(BookingStatus::Confirmed, $future->fresh()->status);
        $this->assertSame(BookingStatus::Pending, $pending->fresh()->status);
        $this->assertSame(BookingStatus::Confirmed, $undated->fresh()->status);

        // Un séjour mené n'est pas une fermeture : ni annonce, ni tâche de remboursement.
        EventFacade::assertNotDispatched(BookingClosed::class);
        $this->assertSame(0, Task::query()->where('taskable_id', $ended->id)->count());

        $this->assertTrue(Activity::query()
            ->where('subject_type', $ended->getMorphClass())
            ->where('subject_id', $ended->id)
            ->where('event', 'booking_completed')
            ->exists());

        // Idempotente : un second passage ne trouve plus rien.
        $this->assertSame(0, (new CompleteEndedBookingsJob)->handle());
    }

    public function test_une_reservation_close_ne_s_annule_plus(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Confirmed, 'start_date' => '2026-10-23', 'end_date' => '2026-11-01']);
        (new CompleteEndedBookingsJob)->handle();
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$booking->id}/cancel")
            ->assertStatus(422)
            ->assertJsonPath('code', 'booking.cannot_cancel');
    }

    public function test_la_tache_est_planifiee_chaque_jour_sans_chevauchement(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn (Event $e) => str_contains((string) $e->description, CompleteEndedBookingsJob::class));

        $this->assertNotNull($event, 'CompleteEndedBookingsJob absente du planificateur');
        $this->assertSame('30 3 * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }
}
