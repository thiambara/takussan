<?php

namespace Tests\Feature\Idempotence;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Customer;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1400 (P144.04, ADR-0072 lot 2) — le scénario mesuré : le bailleur enregistre un acompte, la
 * réponse se perd, il le renvoie. Il y avait deux encaissements `paid` ; sous la même clé, un seul.
 */
class AcompteRejoueTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_acompte_rejoue_sous_la_meme_cle_n_est_encaisse_qu_une_fois(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $booking = Booking::factory()->create([
            'property_id' => $property->id,
            'customer_id' => Customer::factory()->create()->id,
            // Le reste dû borne l'acompte (TCK-1916) : un total tiré sous 100 000 rendait 422.
            'total_amount' => 1_000_000,
        ]);
        Sanctum::actingAs($owner);
        $corps = ['amount' => 100000, 'payment_type' => 'deposit', 'payment_method' => 'cash'];
        $cle = ['Idempotency-Key' => 'a1b2c3d4-0000-4000-8000-acompte00001'];

        $premier = $this->postJson("/api/bookings/{$booking->id}/payments", $corps, $cle)->assertCreated();
        $this->travel(30)->seconds();
        $this->postJson("/api/bookings/{$booking->id}/payments", $corps, $cle)
            ->assertCreated()
            ->assertJsonPath('data.receipt_number', $premier->json('data.receipt_number'));

        $this->assertSame(1, BookingPayment::query()->where('status', 'paid')->count());
    }
}
