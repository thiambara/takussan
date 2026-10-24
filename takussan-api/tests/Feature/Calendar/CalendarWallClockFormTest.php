<?php

namespace Tests\Feature\Calendar;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1502 (P94.02) — `GET /api/calendar` émet `start` et `end` en heure murale UTC,
 * `Y-m-d H:i:s`, sans `T` ni fuseau. C'est un contrat délibéré, hors d'ADR-0018 : le front
 * (`parseServerDate`, `takussan-web/src/lib/calendar-date.ts`) lit cette forme en heure LOCALE du
 * navigateur, et toute la grille raisonne en dates locales.
 *
 * Ce test épingle la forme pour qu'un passage « naïf » du collecteur à `iso()` rougisse ici : il
 * décalerait toutes les heures de l'agenda d'un navigateur hors UTC, sans aucun autre test rouge
 * (le front garde une chaîne qui porte déjà `T`, et `new Date` appliquerait alors le décalage).
 * Changer de contrat se fait des deux côtés à la fois, avec le test front sous `Europe/Paris`.
 */
class CalendarWallClockFormTest extends TestCase
{
    use RefreshDatabase;

    public function test_calendar_events_are_emitted_in_utc_wall_clock_without_offset(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);

        Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create()->id,
            'status' => BookingStatus::Confirmed,
            'start_date' => '2026-10-20',
            'end_date' => '2026-10-22',
        ]);

        PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'visitor_id' => User::factory()->create()->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => Carbon::parse('2026-10-18 21:54:01', 'UTC'),
            'duration_minutes' => 30,
        ]);

        Sanctum::actingAs($owner);

        $events = collect(
            $this->getJson('/api/calendar?start_date=2026-10-17&end_date=2026-10-25')
                ->assertOk()
                ->json('data')
        );

        $visit = $events->firstWhere('type', 'visit');
        $this->assertSame('2026-10-18 21:54:01', $visit['start']);
        $this->assertSame('2026-10-18 22:24:01', $visit['end']);

        $booking = $events->firstWhere('type', 'booking');
        $this->assertSame('2026-10-20 00:00:00', $booking['start']);
        $this->assertSame('2026-10-22 00:00:00', $booking['end']);

        foreach ($events as $event) {
            foreach (['start', 'end'] as $key) {
                $this->assertMatchesRegularExpression(
                    '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/',
                    (string) $event[$key],
                    "{$event['type']}.{$key} sort hors de la forme murale `Y-m-d H:i:s`"
                );
            }
        }
    }
}
