<?php

namespace Tests\Feature\Idempotence;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1406 (P144.03, ADR-0072 lots 2 et 3) — le scénario mesuré : deux demandes identiques à 30 s
 * d'écart créaient deux réservations `pending` et prévenaient deux fois. Sous la même clé, une
 * réservation et une notification, par `POST /api/bookings` comme par la demande publique.
 */
class ReservationRejoueeTest extends TestCase
{
    use RefreshDatabase;

    public function test_une_reservation_du_personnel_rejouee_n_est_creee_qu_une_fois(): void
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs(User::factory()->withAgentProfile($agency)->create());
        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
            'price' => '20000',
        ]);
        $corps = [
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ];

        $this->rejouer('/api/bookings', $corps, 'e1d2c3b4-a596-4877-8899-reserv000001');
    }

    public function test_une_demande_publique_rejouee_n_est_creee_qu_une_fois(): void
    {
        $property = Property::factory()->published()->create([
            'price' => 50_000,
            'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
        ]);
        Sanctum::actingAs(User::factory()->create());
        $corps = [
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(4)->toDateString(),
            'guests' => 2,
        ];

        $this->rejouer("/api/public/properties/{$property->slug}/booking-request", $corps, 'e1d2c3b4-a596-4877-8899-reserv000002');
    }

    /** @param  array<string, mixed>  $corps */
    private function rejouer(string $chemin, array $corps, string $cle): void
    {
        $premiere = $this->postJson($chemin, $corps, ['Idempotency-Key' => $cle])->assertCreated();
        $notifications = DB::table('app_notifications')->count();
        $this->travel(30)->seconds();
        $this->postJson($chemin, $corps, ['Idempotency-Key' => $cle])
            ->assertCreated()
            ->assertJsonPath('data.id', $premiere->json('data.id'));

        $this->assertSame(1, Booking::query()->count());
        $this->assertSame($notifications, DB::table('app_notifications')->count(), 'aucune seconde notification');
    }
}
