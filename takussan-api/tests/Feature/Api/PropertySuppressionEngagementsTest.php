<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P130.04 (TCK-1708) — un bien qui porte une réservation confirmée ou une visite à venir ne se
 * supprime pas : `422`, comme le client et le garant sous bail ouvert.
 *
 * Avant, `DELETE /api/properties/{id}` rendait 204, et la réservation restait `confirmed`, la
 * visite `scheduled`, sur un bien que plus personne ne voyait.
 */
class PropertySuppressionEngagementsTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{User, Property} */
    private function bien(): array
    {
        $owner = User::factory()->create();

        return [$owner, Property::factory()->create(['user_id' => $owner->id])];
    }

    public function test_une_reservation_confirmee_refuse_la_suppression(): void
    {
        [$owner, $property] = $this->bien();
        $booking = Booking::factory()->create(['property_id' => $property->id, 'status' => BookingStatus::Confirmed]);
        Sanctum::actingAs($owner);

        $this->deleteJson("/api/properties/{$property->id}")
            ->assertStatus(422)
            ->assertJsonPath('code', 'property.has_confirmed_booking');

        $this->assertNotSoftDeleted($property);
        $this->assertSame(BookingStatus::Confirmed, $booking->refresh()->status);
    }

    public function test_une_visite_a_venir_refuse_la_suppression(): void
    {
        foreach ([VisitStatus::Scheduled, VisitStatus::Confirmed] as $status) {
            [$owner, $property] = $this->bien();
            PropertyVisit::factory()->create([
                'property_id' => $property->id,
                'status' => $status,
                'scheduled_at' => now()->addDays(2),
            ]);
            Sanctum::actingAs($owner);

            $this->deleteJson("/api/properties/{$property->id}")
                ->assertStatus(422)
                ->assertJsonPath('code', 'property.has_upcoming_visit');

            $this->assertNotSoftDeleted($property);
        }
    }

    public function test_sans_engagement_a_venir_le_bien_se_supprime(): void
    {
        [$owner, $property] = $this->bien();
        // Témoins : ni une réservation en attente ou annulée, ni une visite passée ou annulée ne
        // retiennent le bien.
        foreach ([BookingStatus::Pending, BookingStatus::Cancelled] as $status) {
            Booking::factory()->create(['property_id' => $property->id, 'status' => $status]);
        }
        PropertyVisit::factory()->create(['property_id' => $property->id, 'status' => VisitStatus::Scheduled, 'scheduled_at' => now()->subDay()]);
        PropertyVisit::factory()->create(['property_id' => $property->id, 'status' => VisitStatus::Cancelled, 'scheduled_at' => now()->addDay()]);
        Sanctum::actingAs($owner);

        $this->deleteJson("/api/properties/{$property->id}")->assertNoContent();

        $this->assertSoftDeleted($property);
    }
}
