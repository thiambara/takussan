<?php

namespace Tests\Feature\Public;

use App\Models\Booking;
use App\Models\Enums\ContractType;
use App\Models\Enums\Currency;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Services\Booking\BookingQuote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P246.02 (TCK-2367) — la demande de séjour publique calculait `total_amount` et `deposit_amount` sur
 * le bien lié à la route, puis verrouillait la ligne du bien sans garder sa relecture. Mesuré
 * (db3e25230) : prix passé de 50 000 à 80 000 après la liaison, 3 nuits → 150 000, l'ancien prix.
 *
 * Décision du porteur : les montants se calculent sur le bien relu sous verrou. Le changement de
 * prix est joué une fois, dans l'écouteur `retrieved` du bien, à sa liaison.
 */
class DemandeDeSejourAuPrixReluTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_prix_change_apres_la_liaison_donne_les_montants_du_prix_relu(): void
    {
        $property = Property::factory()->published()->create([
            'price' => 50_000,
            'currency' => Currency::XOF,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
        ]);
        Sanctum::actingAs(User::factory()->create());

        $joue = false;
        Property::retrieved(function (Property $lu) use (&$joue, $property): void {
            if ($joue || $lu->id !== $property->id) {
                return;
            }
            $joue = true;
            DB::table('properties')->where('id', $property->id)->update(['price' => 80_000]);
        });

        $debut = now()->addDay()->startOfDay();
        $fin = $debut->copy()->addDays(3);
        $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => $debut->toDateString(),
            'end_date' => $fin->toDateString(),
            'guests' => 2,
        ])->assertCreated();

        $attendu = app(BookingQuote::class)->for($property->fresh(), Carbon::parse($debut->toDateString()), Carbon::parse($fin->toDateString()));
        $booking = Booking::query()->where('property_id', $property->id)->sole();
        $this->assertSame('240000.00', $attendu['total_amount']);
        $this->assertSame($attendu['total_amount'], $booking->total_amount);
        $this->assertSame($attendu['deposit_amount'], $booking->deposit_amount);
    }
}
