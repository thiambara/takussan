<?php

namespace Tests\Feature\Api;

use App\Events\Booking\BookingClosed;
use App\Exceptions\ApiError;
use App\Models\AppNotification;
use App\Models\Enums\BookingStatus;
use App\Models\User;
use App\Services\Booking\BookingExpirationService;
use App\Services\Model\BookingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-596 (AC2) — une annulation prévient toutes les parties prenantes, moins son auteur.
 * `BookingService::cancel` ne prévenait que le client, même quand c'était lui qui annulait.
 */
class BookingCancellationNotificationTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
    }

    /** @return list<int> */
    private function cancelledRecipients(): array
    {
        return AppNotification::query()->where('code', 'booking.cancelled')->orderBy('user_id')->pluck('user_id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return list<int> */
    private function ids(User ...$users): array
    {
        $ids = array_map(static fn (User $u): int => $u->id, $users);
        sort($ids);

        return $ids;
    }

    public function test_cancelled_by_the_client_notifies_landlord_and_agent_not_the_client(): void
    {
        $booking = $this->bookingOfClient();
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$booking->id}/cancel")->assertOk();

        $this->assertSame($this->ids($this->landlord, $this->agent), $this->cancelledRecipients());
    }

    public function test_cancelled_by_the_agent_notifies_client_and_landlord_not_the_agent(): void
    {
        $booking = $this->bookingOfClient();
        Sanctum::actingAs($this->agent);

        $this->postJson("/api/bookings/{$booking->id}/cancel")->assertOk();

        $this->assertSame($this->ids($this->client, $this->landlord), $this->cancelledRecipients());
    }

    public function test_an_english_recipient_reads_the_english_title(): void
    {
        $this->landlord->update(['preferred_language' => 'en']);
        $booking = $this->bookingOfClient();
        Sanctum::actingAs($this->client);

        $this->postJson("/api/bookings/{$booking->id}/cancel")->assertOk();

        $title = AppNotification::query()->where('code', 'booking.cancelled')->where('user_id', $this->landlord->id)->value('title');
        $this->assertSame(trans('notifications.codes.booking.cancelled.title', [], 'en'), $title);
        $this->assertNotSame(trans('notifications.codes.booking.cancelled.title', [], 'fr'), $title);
    }

    /** Le refus prévient le client par son propre code : `BookingClosed(rejected)` n'en ajoute pas. */
    public function test_reject_does_not_send_the_cancellation_notice(): void
    {
        $booking = $this->bookingOfClient();
        Sanctum::actingAs($this->landlord);

        $this->postJson("/api/bookings/{$booking->id}/reject")->assertOk();

        $this->assertSame([], $this->cancelledRecipients());
        $this->assertSame([$this->client->id], AppNotification::query()->where('code', 'booking.rejected')->pluck('user_id')->map(fn ($id) => (int) $id)->all());
    }

    /**
     * VERIF-596 m2 — une annulation lue AVANT qu'une expiration ne valide. Sans verrou, elle écrasait
     * `expired` par `cancelled` : la réservation était fermée deux fois, et deux avis partaient.
     */
    public function test_a_stale_cancel_after_an_expiry_is_refused_and_closes_once(): void
    {
        $booking = $this->bookingOfClient();
        $stale = $booking->fresh();
        Event::fake([BookingClosed::class]);

        $this->assertTrue(app(BookingExpirationService::class)->expire($booking->fresh(), 'deadline'));

        try {
            app(BookingService::class)->cancel($stale, $this->client);
            $this->fail('une réservation expirée ne s\'annule pas');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('booking.cannot_cancel', $e->errorCode);
        }

        $this->assertSame(BookingStatus::Expired, $booking->fresh()->status);
        Event::assertDispatchedTimes(BookingClosed::class, 1);
        Event::assertDispatched(BookingClosed::class, fn (BookingClosed $e) => $e->reason === BookingClosed::REASON_EXPIRED);
    }

    /** Même défaut sur le refus : lu avant l'expiration, il ne la réécrit pas. */
    public function test_a_stale_reject_after_an_expiry_is_refused_and_closes_once(): void
    {
        $booking = $this->bookingOfClient();
        $stale = $booking->fresh();
        Event::fake([BookingClosed::class]);

        $this->assertTrue(app(BookingExpirationService::class)->expire($booking->fresh(), 'deadline'));

        try {
            app(BookingService::class)->reject($stale, null, $this->landlord);
            $this->fail('une réservation expirée ne se refuse pas');
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame('booking.not_pending_reject', $e->errorCode);
        }

        $this->assertSame(BookingStatus::Expired, $booking->fresh()->status);
        Event::assertDispatchedTimes(BookingClosed::class, 1);
    }
}
