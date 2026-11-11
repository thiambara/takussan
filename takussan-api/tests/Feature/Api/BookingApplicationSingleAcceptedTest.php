<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2734 (décision du porteur du 2026-11-11, option a) — une seule candidature confirmée par bien
 * à la fois : la confirmation dit « acceptée » au client, en accepter deux promet le même logement à
 * deux personnes. La seconde rend `409 booking.application_already_accepted` tant que la première est
 * `confirmed` ; elle se confirme une fois la première annulée, close, ou convertie en bail (qui la
 * passe `completed`). Les offres d'achat et les séjours gardent leurs règles.
 */
class BookingApplicationSingleAcceptedTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private Property $location;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agence = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agence);
        $this->location = $this->bien(ContractType::Rent, RentPeriod::Monthly);
    }

    private function bien(ContractType $contrat, ?RentPeriod $periode): Property
    {
        return Property::factory()->published()->create([
            'agency_id' => $this->agence->id,
            'visibility' => PropertyVisibility::Public,
            'contract_type' => $contrat,
            'rent_period' => $periode,
            'price' => 250_000,
        ]);
    }

    private function demande(Property $bien, BookingKind $nature, BookingStatus $statut, int $debut = 5, int $fin = 365, ?Customer $client = null): Booking
    {
        return Booking::factory()->create([
            'property_id' => $bien->id,
            'agency_id' => $this->agence->id,
            'customer_id' => ($client ?? Customer::factory()->create(['agency_id' => $this->agence->id]))->id,
            'kind' => $nature,
            'status' => $statut,
            'confirmed_at' => $statut === BookingStatus::Confirmed ? now() : null,
            'start_date' => now()->addDays($debut)->toDateString(),
            'end_date' => now()->addDays($fin)->toDateString(),
        ]);
    }

    private function confirmer(Booking $booking): TestResponse
    {
        return $this->actingAsApi($this->agent)->postJson("/api/bookings/{$booking->id}/confirm");
    }

    /** AC1, AC2 — la seconde candidature acceptée sur le même bien est refusée, et reste en attente. */
    public function test_une_seconde_candidature_ne_se_confirme_pas(): void
    {
        $this->demande($this->location, BookingKind::Application, BookingStatus::Confirmed);
        $seconde = $this->demande($this->location, BookingKind::Application, BookingStatus::Pending, 40, 400);

        $this->confirmer($seconde)->assertStatus(409)->assertJsonPath('code', 'booking.application_already_accepted');

        $this->assertSame(BookingStatus::Pending, $seconde->refresh()->status);
        $this->assertNull($seconde->confirmed_at);
        Notification::assertNothingSent();
    }

    /** AC3 — la première annulée, la seconde se confirme. */
    public function test_la_premiere_annulee_la_seconde_se_confirme(): void
    {
        $premiere = $this->demande($this->location, BookingKind::Application, BookingStatus::Confirmed);
        $seconde = $this->demande($this->location, BookingKind::Application, BookingStatus::Pending, 40, 400);
        $this->confirmer($seconde)->assertStatus(409);

        $this->actingAsApi($this->agent)->postJson("/api/bookings/{$premiere->id}/cancel")->assertOk();

        $this->confirmer($seconde)->assertOk()->assertJsonPath('data.status', 'confirmed');
    }

    /**
     * AC3 — une candidature close ne retient plus le bien. Une candidature `confirmed` ne se refuse
     * pas (`reject` n'accepte que `pending`) : « refusée » est l'état d'une autre demande, close.
     */
    public function test_une_candidature_close_ne_retient_pas_le_bien(): void
    {
        foreach ([BookingStatus::Rejected, BookingStatus::Cancelled, BookingStatus::Expired, BookingStatus::Completed] as $close) {
            $this->demande($this->location, BookingKind::Application, $close);
        }
        $seconde = $this->demande($this->location, BookingKind::Application, BookingStatus::Pending, 40, 400);

        $this->confirmer($seconde)->assertOk();
    }

    /** AC3 — la première convertie en bail (qui la passe `completed`), la seconde se confirme. */
    public function test_la_premiere_convertie_en_bail_la_seconde_se_confirme(): void
    {
        $client = Customer::factory()->create(['agency_id' => $this->agence->id]);
        $premiere = $this->demande($this->location, BookingKind::Application, BookingStatus::Confirmed, client: $client);
        $seconde = $this->demande($this->location, BookingKind::Application, BookingStatus::Pending, 40, 400);
        $this->confirmer($seconde)->assertStatus(409);

        $this->actingAsApi($this->agent)->postJson('/api/leases', [
            'property_id' => $this->location->id,
            'tenant_id' => $client->id,
            'booking_id' => $premiere->id,
            'type' => 'residential_rent',
            'start_date' => now()->addDays(5)->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 250000,
            'deposit_amount' => 0,
        ])->assertCreated();
        $this->assertSame(BookingStatus::Completed, $premiere->refresh()->status);

        $this->confirmer($seconde)->assertOk();
    }

    /** La règle est par bien : la candidature acceptée d'un autre bien ne retient pas celui-ci. */
    public function test_la_regle_est_par_bien(): void
    {
        $this->demande($this->bien(ContractType::Rent, RentPeriod::Monthly), BookingKind::Application, BookingStatus::Confirmed);
        $ici = $this->demande($this->location, BookingKind::Application, BookingStatus::Pending);

        $this->confirmer($ici)->assertOk();
    }

    /** AC4 — témoins : deux offres d'achat sur un même bien, deux séjours qui ne se chevauchent pas. */
    public function test_les_offres_et_les_sejours_gardent_leurs_regles(): void
    {
        $vente = $this->bien(ContractType::Sale, null);
        $this->confirmer($this->demande($vente, BookingKind::Offer, BookingStatus::Pending))->assertOk();
        $this->confirmer($this->demande($vente, BookingKind::Offer, BookingStatus::Pending))->assertOk();

        $nuitee = $this->bien(ContractType::Rent, RentPeriod::Daily);
        $this->confirmer($this->demande($nuitee, BookingKind::Stay, BookingStatus::Pending, 5, 8))->assertOk();
        $this->confirmer($this->demande($nuitee, BookingKind::Stay, BookingStatus::Pending, 10, 12))->assertOk();
    }

    /** Une candidature EN ATTENTE ne retient pas le bien : la première acceptée passe. */
    public function test_une_candidature_en_attente_ne_retient_pas_le_bien(): void
    {
        $premiere = $this->demande($this->location, BookingKind::Application, BookingStatus::Pending);
        $this->demande($this->location, BookingKind::Application, BookingStatus::Pending, 40, 400);

        $this->confirmer($premiere)->assertOk();
    }

    /** AC4 — une candidature acceptée ne retient pas un séjour sur le même bien : il garde sa seule règle de nuits. */
    public function test_une_candidature_acceptee_ne_retient_pas_un_sejour(): void
    {
        $this->demande($this->location, BookingKind::Application, BookingStatus::Confirmed);
        $sejour = $this->demande($this->location, BookingKind::Stay, BookingStatus::Pending, 500, 503);

        $this->confirmer($sejour)->assertOk();
    }

    /** AC4 — une offre ou un séjour confirmé sur le bien ne retient pas une candidature. */
    public function test_seule_une_candidature_retient_le_bien(): void
    {
        $this->demande($this->location, BookingKind::Offer, BookingStatus::Confirmed, 500, 510);
        $this->demande($this->location, BookingKind::Stay, BookingStatus::Confirmed, 500, 510);
        $candidature = $this->demande($this->location, BookingKind::Application, BookingStatus::Pending, 5, 400);

        $this->confirmer($candidature)->assertOk();
    }
}
