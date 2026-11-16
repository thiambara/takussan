<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1065 (P80.02) — le tunnel de réservation exige le nombre de voyageurs et l'envoie à
 * `POST /api/bookings`, dont `StoreBookingRequest` n'avait pas de règle `guests` : le nombre était
 * écarté par `validated()`. Il est désormais rangé dans `metadata.guests`, comme le fait déjà la
 * demande publique (`PublicPropertyController::bookingRequest()`).
 *
 * TCK-2892 (ADR-0110 § 1, AC1) — le nombre a sa colonne `bookings.guests`, servie par la ressource ;
 * `metadata.guests` reste écrit et n'est plus lu. Un séjour seulement : une candidature ou une offre
 * du tunnel public qui l'envoie reçoit 422 `booking.field_not_for_kind`. Les séjours d'avant la
 * migration sont rattrapés depuis `metadata.guests`.
 */
class BookingGuestsTest extends TestCase
{
    use RefreshDatabase;

    private Property $property;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $this->property = Property::factory()->create([
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
            'price' => '20000',
        ]);
        $this->customer = Customer::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($agent);
    }

    /** @param  array<string, mixed>  $extra */
    private function book(array $extra = [])
    {
        return $this->postJson('/api/bookings', [
            'property_id' => $this->property->id,
            'customer_id' => $this->customer->id,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ] + $extra);
    }

    public function test_le_nombre_de_voyageurs_est_enregistre(): void
    {
        $this->book(['guests' => 3])->assertCreated()->assertJsonPath('data.guests', 3);

        $this->assertSame(['guests' => 3], Booking::query()->sole()->metadata);
        $this->assertSame(3, Booking::query()->sole()->guests);
    }

    public function test_sans_voyageurs_les_metadonnees_restent_vides(): void
    {
        $this->book()->assertCreated()->assertJsonPath('data.guests', null);

        $this->assertNull(Booking::query()->sole()->metadata);
    }

    public function test_un_nombre_hors_borne_est_refuse(): void
    {
        $this->book(['guests' => 21])->assertUnprocessable()->assertJsonValidationErrors('guests');
        $this->book(['guests' => 0])->assertUnprocessable()->assertJsonValidationErrors('guests');

        $this->assertDatabaseCount('bookings', 0);
    }

    /** @param  array<string, mixed>  $body */
    private function demandePublique(Property $bien, array $body)
    {
        Notification::fake();
        Sanctum::actingAs(User::factory()->create());

        return $this->postJson("/api/public/properties/{$bien->slug}/booking-request", $body);
    }

    private function bienPublie(ContractType $contrat, ?RentPeriod $periode): Property
    {
        return Property::factory()->published()->create([
            'agency_id' => $this->property->agency_id,
            'contract_type' => $contrat,
            'rent_period' => $periode,
            'price' => '20000',
        ]);
    }

    /** TCK-2892 AC1 — un séjour du tunnel public avec `guests = 2` rend `guests = 2`, lu de la colonne. */
    public function test_tck2892_un_sejour_du_tunnel_public_rend_ses_voyageurs(): void
    {
        $this->travelTo('2026-11-15 10:00:00');
        $bien = $this->bienPublie(ContractType::Rent, RentPeriod::Daily);

        $this->demandePublique($bien, ['start_date' => '2026-12-01', 'end_date' => '2026-12-03', 'guests' => 2])
            ->assertCreated()->assertJsonPath('data.guests', 2);

        $booking = Booking::query()->sole();
        $this->assertSame(2, $booking->guests);

        // La colonne, et non `metadata` : la ressource relue rend 2 même si `metadata` dit autre chose.
        $booking->forceFill(['metadata' => ['guests' => 9]])->saveQuietly();
        Sanctum::actingAs(User::factory()->withAgentProfile(Agency::query()->findOrFail($bien->agency_id))->create());
        $this->getJson("/api/bookings/{$booking->id}")->assertOk()->assertJsonPath('data.guests', 2);
    }

    /** TCK-2892 — un séjour EXIGE le nombre de voyageurs au tunnel public. */
    public function test_tck2892_un_sejour_public_sans_voyageurs_est_refuse(): void
    {
        $this->travelTo('2026-11-15 10:00:00');
        $bien = $this->bienPublie(ContractType::Rent, RentPeriod::Daily);

        $this->demandePublique($bien, ['start_date' => '2026-12-01', 'end_date' => '2026-12-03'])
            ->assertUnprocessable()->assertJsonValidationErrors('guests');
        $this->assertDatabaseCount('bookings', 0);
    }

    /** TCK-2892 — hors séjour, `guests` est refusé : 422 `booking.field_not_for_kind`. */
    public function test_tck2892_une_candidature_ou_une_offre_avec_voyageurs_est_refusee(): void
    {
        $this->travelTo('2026-11-15 10:00:00');
        $mensuel = $this->bienPublie(ContractType::Rent, RentPeriod::Monthly);
        $vente = $this->bienPublie(ContractType::Sale, null);

        $this->demandePublique($mensuel, ['start_date' => '2026-12-01', 'end_date' => '2027-12-01', 'guests' => 2])
            ->assertUnprocessable()->assertJsonPath('code', 'booking.field_not_for_kind');
        $this->demandePublique($vente, ['offer_amount' => 15000, 'offer_expires_at' => '2026-11-25', 'terms_accepted' => true, 'guests' => 2])
            ->assertUnprocessable()->assertJsonPath('code', 'booking.field_not_for_kind');
        $this->assertDatabaseCount('bookings', 0);

        // Sans le nombre, la candidature passe, et ne porte aucun voyageur.
        $this->demandePublique($mensuel, ['start_date' => '2026-12-01', 'end_date' => '2027-12-01'])
            ->assertCreated()->assertJsonPath('data.guests', null);
    }

    /** TCK-2892 AC1 — le rattrapage : un séjour d'avant qui portait `metadata.guests = 3` rend 3. */
    public function test_tck2892_le_rattrapage_reprend_les_voyageurs_des_seuls_sejours(): void
    {
        /** @var Migration $migration */
        $migration = require base_path('database/migrations/2026_11_15_289200_add_guests_to_bookings.php');
        $mensuel = $this->bienPublie(ContractType::Rent, RentPeriod::Monthly);

        $sejour = Booking::factory()->create(['property_id' => $this->property->id, 'agency_id' => $this->property->agency_id, 'kind' => 'stay', 'metadata' => ['guests' => 3]]);
        $enTexte = Booking::factory()->create(['property_id' => $this->property->id, 'agency_id' => $this->property->agency_id, 'kind' => 'stay', 'metadata' => ['guests' => '4']]);
        $illisible = Booking::factory()->create(['property_id' => $this->property->id, 'agency_id' => $this->property->agency_id, 'kind' => 'stay', 'metadata' => ['guests' => 'deux']]);
        $sansNombre = Booking::factory()->create(['property_id' => $this->property->id, 'agency_id' => $this->property->agency_id, 'kind' => 'stay', 'metadata' => null]);
        $candidature = Booking::factory()->create(['property_id' => $mensuel->id, 'kind' => 'application', 'metadata' => ['guests' => 2]]);

        $migration->down();
        $this->assertFalse(Schema::hasColumn('bookings', 'guests'));
        $migration->up();

        $lignes = DB::table('bookings')->pluck('guests', 'id');
        $this->assertSame(3, $lignes[$sejour->id]);
        $this->assertSame(4, $lignes[$enTexte->id]);
        $this->assertNull($lignes[$illisible->id]);
        $this->assertNull($lignes[$sansNombre->id]);
        $this->assertNull($lignes[$candidature->id], 'une candidature ne porte pas de voyageurs');

        Sanctum::actingAs(User::factory()->withAgentProfile(Agency::query()->findOrFail($this->property->agency_id))->create());
        $this->getJson("/api/bookings/{$sejour->id}")->assertOk()->assertJsonPath('data.guests', 3);
    }
}
