<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\PropertyCalendarFeed;
use App\Models\PropertyUnavailability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-596 (AC7, §3A) — un bien est libre ou non sur [début, fin), à la demande ET à la
 * confirmation. Une demande sur des nuits déjà confirmées était créée (201), et un séjour qui
 * arrive le jour du départ d'un autre était refusé à la confirmation (bornes fermées).
 */
class BookingAvailabilityTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private Booking $confirmed;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
        // Nuits du 10 au 12 (départ le 13).
        $this->confirmed = $this->bookingOfClient([
            'status' => BookingStatus::Confirmed,
            'confirmed_at' => now(),
            'start_date' => $this->day(10),
            'end_date' => $this->day(13),
        ]);
    }

    private function day(int $offset): string
    {
        return now()->addDays($offset)->toDateString();
    }

    private function publicRequest(int $from, int $to): TestResponse
    {
        Sanctum::actingAs($this->client);

        return $this->postJson("/api/public/properties/{$this->property->slug}/booking-request", [
            'start_date' => $this->day($from),
            'end_date' => $this->day($to),
            'guests' => 1,
        ]);
    }

    public function test_a_private_request_on_confirmed_nights_is_refused_and_creates_nothing(): void
    {
        Sanctum::actingAs($this->client);

        $this->postJson('/api/bookings', [
            'property_id' => $this->property->id,
            'start_date' => $this->day(11),
            'end_date' => $this->day(14),
        ])->assertStatus(422)->assertJsonPath('code', 'booking.dates_overlap');

        $this->assertSame(1, Booking::query()->count());
    }

    public function test_a_public_request_on_confirmed_nights_is_refused_and_creates_nothing(): void
    {
        $this->publicRequest(8, 11)->assertStatus(422)->assertJsonPath('code', 'booking.dates_overlap');

        $this->assertSame(1, Booking::query()->count());
    }

    /** Second chemin : la demande qui ENGLOBE le séjour confirmé. */
    public function test_a_request_spanning_the_whole_confirmed_stay_is_refused(): void
    {
        $this->publicRequest(9, 15)->assertStatus(422);

        $this->assertSame(1, Booking::query()->count());
    }

    public function test_arriving_on_the_departure_day_is_accepted_at_request_and_at_confirmation(): void
    {
        $this->publicRequest(13, 15)->assertCreated();
        $next = Booking::query()->whereKeyNot($this->confirmed->id)->sole();

        Sanctum::actingAs($this->landlord);
        $this->postJson("/api/bookings/{$next->id}/confirm")->assertOk();
        $this->assertSame(BookingStatus::Confirmed, $next->fresh()->status);
    }

    public function test_leaving_on_the_arrival_day_is_accepted_at_request_and_at_confirmation(): void
    {
        $this->publicRequest(7, 10)->assertCreated();
        $previous = Booking::query()->whereKeyNot($this->confirmed->id)->sole();

        Sanctum::actingAs($this->landlord);
        $this->postJson("/api/bookings/{$previous->id}/confirm")->assertOk();
    }

    /** Une demande en attente ne bloque rien : seule une réservation confirmée occupe des nuits. */
    public function test_a_pending_booking_does_not_block_the_same_nights(): void
    {
        $this->confirmed->update(['status' => BookingStatus::Pending, 'confirmed_at' => null]);

        $this->publicRequest(11, 12)->assertCreated();
    }

    /** Second chemin : deux demandes acceptées sur les mêmes nuits, la seconde confirmation refusée. */
    public function test_confirming_the_second_of_two_overlapping_requests_is_refused(): void
    {
        $this->publicRequest(20, 23)->assertCreated();
        $this->publicRequest(21, 24)->assertCreated();
        [$first, $second] = Booking::query()->whereKeyNot($this->confirmed->id)->orderBy('id')->get()->all();

        Sanctum::actingAs($this->landlord);
        $this->postJson("/api/bookings/{$first->id}/confirm")->assertOk();
        $this->postJson("/api/bookings/{$second->id}/confirm")->assertStatus(422)->assertJsonPath('code', 'booking.dates_overlap');
    }

    // ─── §3B (ADR-0041) — une nuit BLOQUÉE refuse comme une nuit réservée ───────────────────────

    public function test_a_private_request_on_blocked_nights_is_refused(): void
    {
        PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(40), 'ends_on' => $this->day(43), 'source' => 'manual',
        ]);
        Sanctum::actingAs($this->client);

        $this->postJson('/api/bookings', [
            'property_id' => $this->property->id,
            'start_date' => $this->day(42),
            'end_date' => $this->day(44),
        ])->assertStatus(422)->assertJsonPath('code', 'booking.dates_unavailable');
        $this->assertSame(0, Booking::query()->whereKeyNot($this->confirmed->id)->count());
    }

    public function test_a_public_request_on_blocked_nights_is_refused(): void
    {
        PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(40), 'ends_on' => $this->day(43), 'source' => 'manual',
        ]);

        $this->publicRequest(39, 41)->assertStatus(422)->assertJsonPath('code', 'booking.dates_unavailable');
        $this->assertSame(0, Booking::query()->whereKeyNot($this->confirmed->id)->count());
    }

    public function test_leaving_on_the_first_blocked_day_is_accepted(): void
    {
        PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(40), 'ends_on' => $this->day(43), 'source' => 'manual',
        ]);

        $this->publicRequest(37, 40)->assertCreated();
        $this->publicRequest(43, 45)->assertCreated();
    }

    /** Second chemin : la demande acceptée AVANT le blocage (importé) ne se confirme plus. */
    public function test_confirming_a_request_whose_nights_were_blocked_since_is_refused(): void
    {
        $this->publicRequest(20, 23)->assertCreated();
        $pending = Booking::query()->whereKeyNot($this->confirmed->id)->sole();
        $feed = PropertyCalendarFeed::query()->create([
            'property_id' => $this->property->id, 'url' => 'https://cal.example.com/a.ics', 'url_host' => 'cal.example.com',
        ]);
        PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(21), 'ends_on' => $this->day(22),
            'source' => 'ical', 'calendar_feed_id' => $feed->id, 'external_uid' => 'x@airbnb',
        ]);

        Sanctum::actingAs($this->landlord);
        $this->postJson("/api/bookings/{$pending->id}/confirm")->assertStatus(422)->assertJsonPath('code', 'booking.dates_unavailable');
        $this->assertSame(BookingStatus::Pending, $pending->fresh()->status);
    }
}
