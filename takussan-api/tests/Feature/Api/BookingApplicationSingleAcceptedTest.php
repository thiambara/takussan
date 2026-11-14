<?php

namespace Tests\Feature\Api;

use App\Jobs\GenerateLeasePaymentSchedule;
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
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2734 (décision du porteur du 2026-11-11, option a) — une seule candidature confirmée par bien
 * à la fois : la confirmation dit « acceptée » au client, en accepter deux promet le même logement à
 * deux personnes. La seconde rend `409 booking.application_already_accepted` tant que la première est
 * `confirmed` ; elle se confirme une fois la première annulée, close, ou convertie en bail (qui la
 * passe `completed`). Les offres d'achat et les séjours gardent leurs règles. Le bail ferme en outre
 * les autres candidatures ouvertes du bien (seconde porte, `BailFermeLesAutresCandidaturesTest`) —
 * depuis la décision 7 du porteur (2026-11-12), à son ENVOI en signature, plus à sa création.
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

    /**
     * AC3 — la première convertie en bail (qui la passe `completed`) ne retient plus le bien. Depuis la
     * seconde porte de TCK-2734, le bail ferme aussi la seconde (`rejected`, « non retenue », cf.
     * `BailFermeLesAutresCandidaturesTest`) — et depuis la décision 7 du porteur (2026-11-12), à son
     * ENVOI en signature : le brouillon seul ne libère rien. Une candidature déposée ensuite pour une
     * entrée APRÈS la fin du bail (TCK-2747 : avant, le bail la refuse) se confirme.
     */
    public function test_la_premiere_convertie_en_bail_ne_retient_plus_le_bien(): void
    {
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        $this->mock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturnUsing(fn (string $template, array $data) => view($template, $data)->render());
        });
        $client = Customer::factory()->create(['agency_id' => $this->agence->id, 'user_id' => User::factory()->create()->id]);
        $premiere = $this->demande($this->location, BookingKind::Application, BookingStatus::Confirmed, client: $client);
        $seconde = $this->demande($this->location, BookingKind::Application, BookingStatus::Pending, 40, 400);
        $this->confirmer($seconde)->assertStatus(409);

        $bail = $this->actingAsApi($this->agent)->postJson('/api/leases', [
            'property_id' => $this->location->id,
            'tenant_id' => $client->id,
            'booking_id' => $premiere->id,
            'type' => 'residential_rent',
            'start_date' => now()->addDays(5)->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 250000,
            'deposit_amount' => 0,
        ])->assertCreated()->json('data.id');
        $this->assertSame(BookingStatus::Confirmed, $premiere->refresh()->status, 'le brouillon ne libère rien');
        $this->confirmer($seconde)->assertStatus(409)->assertJsonPath('code', 'booking.application_already_accepted');

        $this->actingAsApi($this->agent)->postJson("/api/leases/{$bail}/signature-request")->assertOk();
        $this->assertSame(BookingStatus::Completed, $premiere->refresh()->status);
        $this->assertSame(BookingStatus::Rejected, $seconde->refresh()->status);

        $apresLeBail = $this->demande($this->location, BookingKind::Application, BookingStatus::Pending, 400, 800);
        $this->confirmer($apresLeBail)->assertOk();
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

    /**
     * AC4 — la règle ne vise pas les offres, même sur un bien qui porte une candidature acceptée (bien
     * passé de la location à la vente) : un mutant qui soumettrait les offres à la règle rougit ici.
     */
    public function test_une_offre_se_confirme_sur_un_bien_a_candidature_acceptee(): void
    {
        $this->demande($this->location, BookingKind::Application, BookingStatus::Confirmed);
        $this->location->forceFill(['contract_type' => ContractType::Sale, 'rent_period' => null])->save();
        $offre = $this->demande($this->location, BookingKind::Offer, BookingStatus::Pending);

        $this->confirmer($offre)->assertOk()->assertJsonPath('data.status', 'confirmed');
    }

    /**
     * Contrainte stricte — la règle est jugée SOUS le verrou du bien (piège PostgreSQL n° 2) : la ligne
     * du bien est verrouillée avant la requête qui cherche une candidature acceptée. C'est ce verrou qui
     * fait attendre une seconde confirmation concurrente, puis lui fait voir la première.
     *
     * Témoin d'ORDRE, pas de concurrence : l'épreuve à deux connexions (55P03 sous `lock_timeout`, puis
     * 409) a été mesurée, mais elle exige des données validées entre connexions, donc
     * `DatabaseTruncation`, qui viderait au test suivant les lignes que les migrations insèrent et dont
     * dépendent les classes `RefreshDatabase` du même processus. Ce témoin rougit si le verrou disparaît
     * ou si la règle passe avant lui ; il ne prouve pas la sémantique du verrou, qui est celle du moteur.
     */
    public function test_la_regle_est_jugee_sous_le_verrou_du_bien(): void
    {
        $this->demande($this->location, BookingKind::Application, BookingStatus::Confirmed);
        $seconde = $this->demande($this->location, BookingKind::Application, BookingStatus::Pending, 40, 400);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->confirmer($seconde)->assertStatus(409);
        $requetes = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        $verrou = $regle = null;
        foreach ($requetes as $i => $sql) {
            if ($verrou === null && str_contains($sql, 'from "properties"') && str_contains($sql, 'for update')) {
                $verrou = $i;
            }
            // La requête de la règle : `kind` puis `status`, sans dates (celle des nuits filtre
            // `status` puis `kind`, et borne `start_date`/`end_date`).
            if ($regle === null && str_contains($sql, 'from "bookings"') && str_contains($sql, '"kind" = ? and "status" = ?')
                && ! str_contains($sql, 'start_date')) {
                $regle = $i;
            }
        }
        $this->assertNotNull($verrou, 'la ligne du bien est verrouillée');
        $this->assertNotNull($regle, 'la règle est jugée');
        $this->assertLessThan($regle, $verrou, 'le verrou du bien précède la règle');
    }
}
