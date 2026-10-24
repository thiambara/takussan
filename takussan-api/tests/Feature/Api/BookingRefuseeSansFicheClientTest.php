<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * P213.03 (TCK-2199) — la fiche client du demandeur se résout après les gardes, dans la
 * transaction de création, après `assertAvailable` : une demande refusée en 422 (nuits déjà
 * confirmées) ne crée plus de fiche `customers`, par `POST /api/bookings` comme par le tunnel public.
 */
class BookingRefuseeSansFicheClientTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private User $nouveau;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
        $this->bookingOfClient([
            'status' => BookingStatus::Confirmed,
            'confirmed_at' => now(),
            'start_date' => $this->day(10),
            'end_date' => $this->day(13),
        ]);
        $this->nouveau = User::factory()->create();
        Sanctum::actingAs($this->nouveau);
    }

    private function day(int $offset): string
    {
        return now()->addDays($offset)->toDateString();
    }

    private function fiches(): int
    {
        return Customer::query()->where('user_id', $this->nouveau->id)->count();
    }

    public function test_une_demande_privee_refusee_ne_cree_pas_de_fiche_client(): void
    {
        $this->postJson('/api/bookings', [
            'property_id' => $this->property->id,
            'start_date' => $this->day(11),
            'end_date' => $this->day(14),
        ])->assertStatus(422)->assertJsonPath('code', 'booking.dates_overlap');

        $this->assertSame(0, $this->fiches());
    }

    public function test_une_demande_publique_refusee_ne_cree_pas_de_fiche_client(): void
    {
        $this->postJson("/api/public/properties/{$this->property->slug}/booking-request", [
            'start_date' => $this->day(8),
            'end_date' => $this->day(11),
            'guests' => 1,
        ])->assertStatus(422)->assertJsonPath('code', 'booking.dates_overlap');

        $this->assertSame(0, $this->fiches());
    }

    public function test_une_demande_acceptee_cree_la_fiche_et_s_y_rattache(): void
    {
        $this->postJson('/api/bookings', [
            'property_id' => $this->property->id,
            'start_date' => $this->day(20),
            'end_date' => $this->day(22),
        ])->assertCreated();
        $this->postJson("/api/public/properties/{$this->property->slug}/booking-request", [
            'start_date' => $this->day(30),
            'end_date' => $this->day(32),
            'guests' => 1,
        ])->assertCreated();

        $fiche = Customer::query()->where('user_id', $this->nouveau->id)->sole();
        $this->assertSame(2, Booking::query()->where('customer_id', $fiche->id)->count());
    }
}
