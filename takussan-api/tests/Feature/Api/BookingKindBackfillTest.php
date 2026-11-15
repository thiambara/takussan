<?php

namespace Tests\Feature\Api;

use App\Models\Booking;
use App\Models\Enums\BookingKind;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * TCK-2579 (AC5, ADR-0102 § Conséquences) — après la migration, chaque réservation porte la nature
 * que donne son bien ; le contrat CONNU au moment de la réservation (`metadata.kind = 'offer'`,
 * `metadata.guests`) l'emporte sur le contrat actuel.
 *
 * Le parc est construit, puis la migration rejouée : `down()` (les colonnes et leur contenu
 * disparaissent), `up()` (le rattrapage). Le DDL de PostgreSQL est transactionnel :
 * `RefreshDatabase` remet tout en place. La comparaison est EXHAUSTIVE : chaque ligne, supprimées
 * comprises. La preuve sur la base de démo est dans les notes du ticket.
 */
class BookingKindBackfillTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'database/migrations/2026_11_11_130400_add_kind_to_bookings.php';

    private function migration(): Migration
    {
        return require base_path(self::MIGRATION);
    }

    private function bien(ContractType $contract, ?RentPeriod $period): Property
    {
        return Property::factory()->create(['contract_type' => $contract, 'rent_period' => $period, 'price' => '150000']);
    }

    /** @param  array<string, mixed>|null  $metadata */
    private function reservation(Property $property, ?array $metadata = null): Booking
    {
        return Booking::factory()->create(['property_id' => $property->id, 'metadata' => $metadata, 'kind' => null]);
    }

    public function test_every_booking_gets_the_kind_its_property_gave_it(): void
    {
        $attendu = [];
        $attendu[$this->reservation($this->bien(ContractType::Sale, null))->id] = 'offer';
        $attendu[$this->reservation($this->bien(ContractType::Rent, RentPeriod::Daily))->id] = 'stay';
        $attendu[$this->reservation($this->bien(ContractType::Rent, RentPeriod::Weekly))->id] = 'stay';
        $attendu[$this->reservation($this->bien(ContractType::Rent, RentPeriod::Monthly))->id] = 'application';
        $attendu[$this->reservation($this->bien(ContractType::Rent, RentPeriod::Yearly))->id] = 'application';

        // Le contrat connu à la réservation l'emporte : une offre publique sur un bien passé en
        // location reste une offre ; une demande de location sur un bien passé en vente reste une
        // candidature (période inconnue).
        $attendu[$this->reservation($this->bien(ContractType::Rent, RentPeriod::Daily), [
            'kind' => 'offer', 'offer_amount' => 140000, 'offer_expires_at' => '2026-12-01', 'list_price_at_offer' => 150000.0,
        ])->id] = 'offer';
        $attendu[$this->reservation($this->bien(ContractType::Sale, null), ['guests' => 2])->id] = 'application';

        // Supprimées des deux côtés : elles reçoivent aussi leur nature (NOT NULL).
        $supprimee = $this->reservation($this->bien(ContractType::Rent, RentPeriod::Daily));
        $supprimee->delete();
        $attendu[$supprimee->id] = 'stay';
        $bienSupprime = $this->bien(ContractType::Sale, null);
        $attendu[$this->reservation($bienSupprime)->id] = 'offer';
        $bienSupprime->delete();

        $this->migration()->down();
        $this->assertFalse(Schema::hasColumn('bookings', 'kind'));
        $this->migration()->up();

        $obtenu = DB::table('bookings')->orderBy('id')->pluck('kind', 'id')->all();
        ksort($attendu);
        $this->assertSame($attendu, $obtenu);

        // Hors cas ambigus, la règle SQL est celle de `BookingKind::forProperty()`.
        foreach (Booking::withTrashed()->with(['property' => fn ($q) => $q->withTrashed()])->get() as $booking) {
            if ($booking->metadata === null) {
                $this->assertSame(BookingKind::forProperty($booking->property), $booking->kind, "réservation {$booking->id}");
            }
        }
    }

    public function test_the_terms_of_a_public_offer_are_copied_and_unreadable_ones_stay_null(): void
    {
        $lisible = $this->reservation($this->bien(ContractType::Sale, null), [
            'kind' => 'offer', 'offer_amount' => 140000, 'offer_expires_at' => '2026-12-01', 'list_price_at_offer' => 150000.5,
        ]);
        $illisible = $this->reservation($this->bien(ContractType::Sale, null), [
            'kind' => 'offer', 'offer_expires_at' => 'demain', 'list_price_at_offer' => 'cent mille',
        ]);
        $sejour = $this->reservation($this->bien(ContractType::Rent, RentPeriod::Daily), ['guests' => 1]);

        $this->migration()->down();
        $this->migration()->up();

        $lignes = DB::table('bookings')->get()->keyBy('id');
        $this->assertSame('2026-12-01', $lignes[$lisible->id]->offer_expires_at);
        $this->assertSame('150000.50', $lignes[$lisible->id]->list_price_at_booking);
        $this->assertNull($lignes[$illisible->id]->offer_expires_at);
        $this->assertNull($lignes[$illisible->id]->list_price_at_booking);
        $this->assertNull($lignes[$sejour->id]->list_price_at_booking);
    }

    public function test_kind_is_not_null_after_the_migration_and_down_is_reversible(): void
    {
        $this->migration()->down();
        $this->migration()->up();

        $this->assertTrue(Schema::hasColumns('bookings', ['kind', 'offer_expires_at', 'list_price_at_booking']));
        $this->expectException(QueryException::class);
        DB::table('bookings')->insert([
            'property_id' => $this->bien(ContractType::Sale, null)->id,
            'status' => 'pending',
            'total_amount' => 1,
            'currency' => 'XOF',
        ]);
    }

    /** Une création qui ne dit pas sa nature la reçoit du bien, y compris sans événements (seeders). */
    public function test_a_creation_without_kind_gets_it_from_the_property_even_without_events(): void
    {
        $mensuel = $this->bien(ContractType::Rent, RentPeriod::Monthly);
        $booking = Booking::withoutEvents(fn () => Booking::factory()->create(['property_id' => $mensuel->id, 'kind' => null]));

        $this->assertSame(BookingKind::Application, $booking->refresh()->kind);
    }
}
