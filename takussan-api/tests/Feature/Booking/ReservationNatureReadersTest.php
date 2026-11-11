<?php

namespace Tests\Feature\Booking;

use App\Jobs\Booking\CompleteEndedBookingsJob;
use App\Models\Booking;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-2735 (ADR-0102 § 3) — seul un séjour occupe des nuits, chez chaque lecteur des réservations :
 * l'export iCal, l'agenda, le taux d'occupation courte durée et la clôture des séjours menés. Une
 * candidature ou une offre confirmée et datée n'y est ni une nuit prise, ni un séjour « terminé » :
 * son issue est le bail ou la vente.
 *
 * Le bien est loué à la nuit, et la candidature y est posée avec sa nature : c'est le cas d'un bien
 * dont le contrat a changé depuis la demande, le seul où l'écart se produit sur ces lecteurs. Chaque
 * cas porte son témoin, un séjour sur le même bien, qui y apparaît.
 */
class ReservationNatureReadersTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private Booking $candidature;

    private Booking $sejour;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->buildStakeholders();

        // Dix nuits de candidature, trois de séjour, en novembre.
        $this->candidature = $this->bookingOfClient([
            'kind' => BookingKind::Application, 'status' => BookingStatus::Confirmed, 'confirmed_at' => now(),
            'start_date' => '2026-11-03', 'end_date' => '2026-11-13',
        ]);
        $this->sejour = $this->bookingOfClient([
            'kind' => BookingKind::Stay, 'status' => BookingStatus::Confirmed, 'confirmed_at' => now(),
            'start_date' => '2026-11-20', 'end_date' => '2026-11-23',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_l_export_ical_ne_porte_que_le_sejour(): void
    {
        Sanctum::actingAs($this->landlord);
        $url = $this->postJson("/api/properties/{$this->property->id}/ical-token")->assertCreated()->json('data.url');
        $this->app['auth']->forgetGuards();

        $body = $this->get((string) parse_url($url, PHP_URL_PATH))->assertOk()->getContent();

        $this->assertStringContainsString('DTSTART;VALUE=DATE:20261120', $body);
        $this->assertStringNotContainsString('DTSTART;VALUE=DATE:20261103', $body);
        $this->assertStringNotContainsString("booking-{$this->candidature->id}@takussan", $body);
    }

    public function test_l_agenda_ne_montre_que_le_sejour(): void
    {
        Sanctum::actingAs($this->landlord);

        $reservations = collect($this->getJson('/api/calendar?start_date=2026-11-01&end_date=2026-11-30')->assertOk()->json('data'))
            ->where('type', 'booking')->pluck('id')->all();

        $this->assertSame([$this->sejour->id], $reservations);
    }

    public function test_le_taux_d_occupation_ne_compte_que_les_nuits_du_sejour(): void
    {
        Sanctum::actingAs($this->landlord);

        // 3 nuits sur 30, et non 13 : la candidature n'occupe rien.
        $this->assertEquals(10.0, $this->getJson('/api/dashboard/owner')->assertOk()->json('data.occupancy.short_stay_percent'));
    }

    public function test_la_cloture_ne_termine_que_le_sejour(): void
    {
        $offre = $this->bookingOfClient([
            'kind' => BookingKind::Offer, 'status' => BookingStatus::Confirmed, 'confirmed_at' => now(),
            'start_date' => '2026-11-01', 'end_date' => '2026-11-10',
        ]);
        $sejourFini = $this->bookingOfClient([
            'kind' => BookingKind::Stay, 'status' => BookingStatus::Confirmed, 'confirmed_at' => now(),
            'start_date' => '2026-11-11', 'end_date' => '2026-11-14',
        ]);

        $this->assertSame(1, (new CompleteEndedBookingsJob)->handle());

        $this->assertSame(BookingStatus::Completed, $sejourFini->fresh()->status);
        $this->assertSame(BookingStatus::Confirmed, $this->candidature->fresh()->status);
        $this->assertSame(BookingStatus::Confirmed, $offre->fresh()->status);

        // Idempotente : un second passage ne touche rien.
        $this->assertSame(0, (new CompleteEndedBookingsJob)->handle());
    }
}
