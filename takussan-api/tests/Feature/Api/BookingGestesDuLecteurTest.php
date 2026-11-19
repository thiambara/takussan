<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2958 — `abilities` d'une réservation (le show, et la carte du fil qui la relit) : les gestes que
 * le service accepterait pour CE lecteur. Un séjour confirmé dont le premier jour est arrivé ne
 * s'annule plus (TCK-1301, `BookingService::cancel`) : la veille, si.
 */
class BookingGestesDuLecteurTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** @return array{confirm: bool, reject: bool, cancel: bool} */
    private function gestes(BookingStatus $status, string $debut): array
    {
        Carbon::setTestNow('2026-11-18 10:00:00');
        $client = User::factory()->create();
        $booking = Booking::factory()->create([
            'customer_id' => Customer::factory()->create(['user_id' => $client->id])->id,
            'created_by_id' => $client->id,
            'status' => $status,
            'start_date' => $debut,
            'end_date' => Carbon::parse($debut)->addDays(10)->toDateString(),
        ]);

        Sanctum::actingAs($client);

        return $this->getJson("/api/bookings/{$booking->id}")->assertOk()->json('data.abilities');
    }

    public function test_un_sejour_confirme_qui_commence_aujourd_hui_ne_s_annule_plus(): void
    {
        $this->assertFalse($this->gestes(BookingStatus::Confirmed, '2026-11-18')['cancel']);
    }

    public function test_un_sejour_confirme_qui_commence_demain_s_annule(): void
    {
        $this->assertTrue($this->gestes(BookingStatus::Confirmed, '2026-11-19')['cancel']);
    }

    public function test_le_client_ne_valide_pas_sa_propre_demande(): void
    {
        $gestes = $this->gestes(BookingStatus::Pending, '2026-11-25');

        $this->assertSame(['confirm' => false, 'reject' => false, 'cancel' => true], $gestes);
    }

    public function test_une_reservation_terminee_n_offre_aucun_geste(): void
    {
        $this->assertSame(['confirm' => false, 'reject' => false, 'cancel' => false], $this->gestes(BookingStatus::Completed, '2026-10-01'));
    }
}
