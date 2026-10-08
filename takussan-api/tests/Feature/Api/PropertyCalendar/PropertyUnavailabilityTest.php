<?php

namespace Tests\Feature\Api\PropertyCalendar;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\PropertyCalendarFeed;
use App\Models\PropertyUnavailability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-596 §3B (ADR-0041) — l'hôte bloque des dates de son bien ; le tunnel public lit les nuits
 * occupées sans rien apprendre d'autre. Le refus d'une RÉSERVATION sur une nuit bloquée vit dans
 * `BookingAvailabilityTest`, à côté de celui sur une nuit réservée.
 */
class PropertyUnavailabilityTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
    }

    private function day(int $offset): string
    {
        return now()->addDays($offset)->toDateString();
    }

    private function block(int $from, int $to): TestResponse
    {
        return $this->postJson("/api/properties/{$this->property->id}/unavailabilities", [
            'starts_on' => $this->day($from),
            'ends_on' => $this->day($to),
            'reason' => 'Travaux',
        ]);
    }

    private function confirmedStay(int $from, int $to): Booking
    {
        return $this->bookingOfClient([
            'status' => BookingStatus::Confirmed,
            'confirmed_at' => now(),
            'start_date' => $this->day($from),
            'end_date' => $this->day($to),
        ]);
    }

    public function test_the_landlord_blocks_dates_and_reads_them_back(): void
    {
        Sanctum::actingAs($this->landlord);

        $this->block(5, 8)->assertCreated()
            ->assertJsonPath('data.source', 'manual')
            ->assertJsonPath('data.starts_on', $this->day(5))
            ->assertJsonPath('data.ends_on', $this->day(8));

        $this->getJson("/api/properties/{$this->property->id}/unavailabilities?from={$this->day(0)}&to={$this->day(30)}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.reason', 'Travaux');
    }

    public function test_an_inverted_or_empty_range_is_refused(): void
    {
        Sanctum::actingAs($this->landlord);

        $this->block(8, 8)->assertStatus(422)->assertJsonValidationErrors('ends_on');
        $this->block(8, 5)->assertStatus(422)->assertJsonValidationErrors('ends_on');
        $this->assertSame(0, PropertyUnavailability::query()->count());
    }

    /** ADR-0041 §6 — un blocage manuel sur une réservation confirmée : l'hôte sait, il est refusé. */
    public function test_a_manual_block_over_a_confirmed_booking_is_refused(): void
    {
        $this->confirmedStay(10, 13);
        Sanctum::actingAs($this->landlord);

        $this->block(12, 15)->assertStatus(422)->assertJsonPath('code', 'unavailability.overlaps_booking');
        $this->assertSame(0, PropertyUnavailability::query()->count());
    }

    public function test_a_block_ending_on_the_arrival_day_of_a_confirmed_booking_is_accepted(): void
    {
        $this->confirmedStay(10, 13);
        Sanctum::actingAs($this->landlord);

        $this->block(7, 10)->assertCreated();
        $this->block(13, 15)->assertCreated();
    }

    public function test_the_landlord_removes_a_manual_block_but_not_an_imported_one(): void
    {
        $manual = PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(1), 'ends_on' => $this->day(2), 'source' => 'manual',
        ]);
        $feed = PropertyCalendarFeed::query()->create([
            'property_id' => $this->property->id, 'url' => 'https://cal.example.com/a.ics', 'url_host' => 'cal.example.com',
        ]);
        $imported = PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(4), 'ends_on' => $this->day(6),
            'source' => 'ical', 'calendar_feed_id' => $feed->id, 'external_uid' => 'x@airbnb',
        ]);
        Sanctum::actingAs($this->landlord);

        $this->deleteJson("/api/property-unavailabilities/{$manual->id}")->assertNoContent();
        $this->deleteJson("/api/property-unavailabilities/{$imported->id}")->assertStatus(422)->assertJsonPath('code', 'unavailability.imported_locked');
        $this->assertModelExists($imported);
        $this->assertModelMissing($manual);
    }

    /** Ni un client, ni l'agent d'une autre agence, ni un bailleur bloqué ne gère les dates. */
    public function test_someone_who_cannot_edit_the_property_manages_no_dates(): void
    {
        $block = PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(1), 'ends_on' => $this->day(2), 'source' => 'manual',
        ]);
        $outsider = $this->agencyAgent(Agency::factory()->create());

        foreach ([$this->client, $outsider] as $user) {
            Sanctum::actingAs($user);
            $this->block(5, 8)->assertForbidden();
            $this->getJson("/api/properties/{$this->property->id}/unavailabilities")->assertForbidden();
            $this->deleteJson("/api/property-unavailabilities/{$block->id}")->assertForbidden();
        }

        $this->assertSame(1, PropertyUnavailability::query()->count());
    }

    public function test_a_blocked_landlord_loses_the_calendar_writes(): void
    {
        $this->landlord->ownerProfiles()->where('agency_id', $this->agency->id)->update(['status' => OwnerProfileStatus::Blocked->value]);
        $block = PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(1), 'ends_on' => $this->day(2), 'source' => 'manual',
        ]);
        Sanctum::actingAs($this->landlord->fresh());

        $this->block(5, 8)->assertForbidden();
        $this->deleteJson("/api/property-unavailabilities/{$block->id}")->assertForbidden();
    }

    /** La règle est celle de `PropertyPolicy::update` : l'administrateur de l'agence du bien. */
    public function test_the_agency_admin_manages_its_dates(): void
    {
        Sanctum::actingAs($this->agencyAdmin($this->agency));

        $this->block(5, 8)->assertCreated();
    }

    /** Le tunnel public : des nuits, fusionnées, sans réservation, motif ni source. */
    public function test_the_public_availability_lists_merged_ranges_and_nothing_else(): void
    {
        $this->confirmedStay(10, 13);
        PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(13), 'ends_on' => $this->day(15), 'source' => 'manual', 'reason' => 'Famille',
        ]);
        PropertyUnavailability::query()->create([
            'property_id' => $this->property->id, 'starts_on' => $this->day(20), 'ends_on' => $this->day(21), 'source' => 'manual',
        ]);
        $this->bookingOfClient(['status' => BookingStatus::Pending, 'start_date' => $this->day(25), 'end_date' => $this->day(27)]);

        $response = $this->getJson("/api/public/properties/{$this->property->slug}/availability?from={$this->day(0)}&to={$this->day(60)}")
            ->assertOk();

        $this->assertSame([
            ['start' => $this->day(10), 'end' => $this->day(15)],
            ['start' => $this->day(20), 'end' => $this->day(21)],
        ], $response->json('data.occupied'));
        $this->assertStringNotContainsString('Famille', $response->getContent());
        $this->assertStringNotContainsString('reference', $response->getContent());
    }

    public function test_the_availability_of_a_private_property_is_not_found(): void
    {
        $this->property->update(['visibility' => PropertyVisibility::Private]);

        $this->getJson("/api/public/properties/{$this->property->slug}/availability")->assertNotFound();
    }
}
