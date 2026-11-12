<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RentPeriod;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Database\Seeders\Activity\LeaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2747 (décision 6 du porteur, 2026-11-12, option a) — l'agent qui accepte une candidature ne
 * promet pas au client un logement qu'un bail occupe, ou occupera : un bail `active` ou `terminating`,
 * ou à venir (`draft`, `pending_signature`), qui couvre le début demandé rend
 * `409 booking.property_already_leased`, et la candidature reste `pending`. Une relocation après la fin
 * du bail (`fin du bail < début demandé`) reste possible. Offres d'achat et séjours n'y sont pas soumis.
 */
class CandidatureSurUnBienDejaLoueTest extends ApiTestCase
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
        $this->location = Property::factory()->published()->create([
            'agency_id' => $this->agence->id,
            'visibility' => PropertyVisibility::Public,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => 250_000,
        ]);
    }

    private function client(): Customer
    {
        return Customer::factory()->create(['agency_id' => $this->agence->id]);
    }

    /** Un bail du bien, du jour J-30 à `fin` (en jours depuis aujourd'hui ; `null` = sans fin). */
    private function bail(LeaseStatus $statut, ?int $fin = 300, ?Customer $locataire = null, ?Property $bien = null): Lease
    {
        $bien ??= $this->location;

        return Lease::factory()->create([
            'property_id' => $bien->id,
            'landlord_id' => $bien->user_id,
            'tenant_id' => ($locataire ?? $this->client())->id,
            'agency_id' => $this->agence->id,
            'status' => $statut,
            'start_date' => now()->subDays(30)->toDateString(),
            'end_date' => $fin === null ? null : now()->addDays($fin)->toDateString(),
        ]);
    }

    private function demande(BookingKind $nature = BookingKind::Application, ?int $debut = 60, ?Customer $client = null, ?Property $bien = null): Booking
    {
        return Booking::factory()->create([
            'property_id' => ($bien ?? $this->location)->id,
            'agency_id' => $this->agence->id,
            'customer_id' => ($client ?? $this->client())->id,
            'kind' => $nature,
            'status' => BookingStatus::Pending,
            'start_date' => $debut === null ? null : now()->addDays($debut)->toDateString(),
            'end_date' => $debut === null ? null : now()->addDays($debut + 365)->toDateString(),
        ]);
    }

    private function confirmer(Booking $booking): TestResponse
    {
        return $this->actingAsApi($this->agent)->postJson("/api/bookings/{$booking->id}/confirm");
    }

    private function assertRefusee(Booking $candidature): void
    {
        $this->confirmer($candidature)->assertStatus(409)->assertJsonPath('code', 'booking.property_already_leased');
        $this->assertSame(BookingStatus::Pending, $candidature->refresh()->status);
    }

    /** AC1, AC2 — un bail actif qui couvre le début demandé : 409, la candidature reste en attente. */
    public function test_un_bail_actif_refuse_la_confirmation(): void
    {
        $this->bail(LeaseStatus::Active);

        $this->assertRefusee($this->demande());
    }

    /** AC2 — un bail à venir (brouillon, en signature) ou dont le préavis court, aussi. */
    public function test_un_bail_a_venir_ou_en_preavis_refuse_aussi(): void
    {
        foreach ([LeaseStatus::Draft, LeaseStatus::PendingSignature, LeaseStatus::Terminating] as $statut) {
            $bien = Property::factory()->published()->create(['agency_id' => $this->agence->id, 'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly]);
            $this->bail($statut, bien: $bien);

            $this->assertRefusee($this->demande(bien: $bien));
        }
    }

    /** AC2 — un bail sans fin couvre tout début ; une candidature sans date n'en prouve aucun après. */
    public function test_bail_sans_fin_et_candidature_sans_date(): void
    {
        $this->bail(LeaseStatus::Active, null);
        $this->assertRefusee($this->demande(debut: 900));

        $autreBien = Property::factory()->published()->create(['agency_id' => $this->agence->id, 'contract_type' => ContractType::Rent, 'rent_period' => RentPeriod::Monthly]);
        $this->bail(LeaseStatus::Active, 300, bien: $autreBien);
        $this->assertRefusee($this->demande(debut: null, bien: $autreBien));
    }

    /** AC2 — le jour même de la fin du bail est encore couvert. */
    public function test_le_jour_de_fin_du_bail_est_couvert(): void
    {
        $this->bail(LeaseStatus::Active, 300);

        $this->assertRefusee($this->demande(debut: 300));
    }

    /** AC3 — le bail finit AVANT le début demandé (strictement) : la relocation se confirme. */
    public function test_une_relocation_apres_la_fin_du_bail_se_confirme(): void
    {
        $this->bail(LeaseStatus::Active, 300);

        $this->confirmer($this->demande(debut: 301))->assertOk()->assertJsonPath('data.status', 'confirmed');
    }

    /** AC2 — un bail en préavis couvre encore sa date d'effet. */
    public function test_un_preavis_couvre_sa_date_d_effet(): void
    {
        $bail = $this->bail(LeaseStatus::Terminating, 300);
        $bail->forceFill(['early_termination_effective_date' => now()->addDays(50)->toDateString()])->save();

        $this->assertRefusee($this->demande(debut: 50));
    }

    /** AC3 — un bail en préavis finit à sa date d'effet : une entrée le lendemain se confirme. */
    public function test_un_preavis_finit_a_sa_date_d_effet(): void
    {
        $bail = $this->bail(LeaseStatus::Terminating, 300);
        $bail->forceFill(['early_termination_effective_date' => now()->addDays(50)->toDateString()])->save();

        $this->confirmer($this->demande(debut: 51))->assertOk();
    }

    /** Un bail résilié, expiré ou renouvelé n'occupe plus le bien ; celui d'un autre bien non plus. */
    public function test_les_baux_clos_et_ceux_d_un_autre_bien_ne_refusent_rien(): void
    {
        foreach ([LeaseStatus::Terminated, LeaseStatus::Expired, LeaseStatus::Renewed] as $statut) {
            $this->bail($statut);
        }
        $this->bail(LeaseStatus::Active, bien: Property::factory()->create(['agency_id' => $this->agence->id]));

        $this->confirmer($this->demande())->assertOk();
    }

    /**
     * Le bail du candidat lui-même ne le refuse pas : depuis la décision 7 (TCK-2734), sa candidature
     * reste ouverte pendant le brouillon tiré d'elle, et l'agent peut encore l'accepter.
     */
    public function test_le_bail_du_candidat_ne_le_refuse_pas(): void
    {
        $candidat = $this->client();
        $this->bail(LeaseStatus::Draft, locataire: $candidat);

        $this->confirmer($this->demande(client: $candidat))->assertOk();
    }

    /** Témoins : une offre d'achat et un séjour ne sont pas soumis à la règle. */
    public function test_offres_et_sejours_ne_sont_pas_soumis(): void
    {
        $this->bail(LeaseStatus::Active);

        $this->confirmer($this->demande(BookingKind::Offer))->assertOk();
        $this->confirmer($this->demande(BookingKind::Stay, 400))->assertOk();
    }

    /** La règle est jugée sous le verrou du bien que `confirm()` prend, avant de lire les baux. */
    public function test_la_regle_est_jugee_sous_le_verrou_du_bien(): void
    {
        $this->bail(LeaseStatus::Active);
        $candidature = $this->demande();

        $requetes = [];
        DB::listen(function ($q) use (&$requetes): void {
            if (preg_match('/from "(properties|leases)" where/', $q->sql, $m) === 1) {
                $requetes[] = $m[1].(str_contains($q->sql, 'for update') ? ':verrou' : '');
            }
        });
        $this->confirmer($candidature)->assertStatus(409);

        $verrou = array_search('properties:verrou', $requetes, true);
        $lecture = array_search('leases', $requetes, true);
        $this->assertNotFalse($verrou);
        $this->assertNotFalse($lecture);
        $this->assertLessThan($lecture, $verrou, 'le bien est verrouillé avant la lecture des baux');
    }

    /**
     * Le jeu de démo (delta du ticket) : les réservations sont semées avant les baux ; une candidature
     * acceptée qu'un bail d'un autre client couvre se ferme (`rejected`), par la règle même de l'API.
     * Celle qui entre après la fin du bail, celle du locataire et celle en attente restent.
     */
    public function test_le_jeu_de_demo_ne_laisse_pas_de_candidature_acceptee_sur_un_bien_loue(): void
    {
        $locataire = $this->client();
        $this->bail(LeaseStatus::Active, 300, $locataire);
        $couverte = $this->demande(debut: 60);
        $apres = $this->demande(debut: 301);
        $duLocataire = $this->demande(client: $locataire);
        $enAttente = $this->demande(debut: 60);
        foreach ([$couverte, $apres, $duLocataire] as $b) {
            $b->forceFill(['status' => BookingStatus::Confirmed, 'confirmed_at' => now()])->save();
        }

        $this->assertSame(1, LeaseSeeder::fermerLesCandidaturesSurUnBienLoue());

        $this->assertSame(BookingStatus::Rejected, $couverte->refresh()->status);
        $this->assertNotNull($couverte->cancelled_at);
        $this->assertSame(BookingStatus::Confirmed, $apres->refresh()->status);
        $this->assertSame(BookingStatus::Confirmed, $duLocataire->refresh()->status);
        $this->assertSame(BookingStatus::Pending, $enAttente->refresh()->status);
    }
}
