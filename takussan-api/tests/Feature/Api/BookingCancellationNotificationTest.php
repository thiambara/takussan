<?php

namespace Tests\Feature\Api;

use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
