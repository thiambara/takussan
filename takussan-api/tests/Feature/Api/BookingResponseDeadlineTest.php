<?php

namespace Tests\Feature\Api;

use App\Http\Resources\BookingResource;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use App\Services\Booking\BookingExpirationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-575 — la confirmation d'une demande de réservation promettait « sous 48h » en dur, alors que
 * le délai est PAR AGENCE (`booking_pending_expiry_hours`, 1 à 168 h, 0 = désactivé) et qu'une
 * seconde échéance, `expires_at`, s'applique aussi (7 jours par défaut, job `ExpireBookings`).
 *
 * Mesuré le 2026-09-24 sur la pile locale : `POST /api/bookings` rendait `expires_at` = création
 * + 7 jours pour une agence au seuil par défaut de 48 h. `expires_at` seul ne dit donc pas la
 * vérité ; `response_deadline` est la première des deux échéances qui s'appliquera.
 */
class BookingResponseDeadlineTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Sanctum::actingAs(User::factory()->create());
        $this->travelTo(now()->startOfSecond());
    }

    /** @param  array<string,mixed>|null  $settings */
    private function reserverChez(?array $settings): array
    {
        $agency = Agency::factory()->create(['settings' => $settings]);
        $property = Property::factory()->create([
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
            'price' => '20000',
        ]);

        // Le payload du tunnel public : ni montant, ni `customer_id`, ni `expires_at`.
        return $this->postJson('/api/bookings', [
            'property_id' => $property->id,
            'start_date' => now()->addDays(2)->toDateString(),
            'end_date' => now()->addDays(5)->toDateString(),
        ])->assertCreated()->json('data');
    }

    public function test_seuil_par_defaut_de_l_agence_48_h_et_non_les_7_jours_d_expires_at(): void
    {
        $data = $this->reserverChez(null);

        $this->assertSame(now()->addHours(48)->utc()->format(DATE_ATOM), $data['response_deadline']);
        // Le champ qu'on aurait pu afficher tel quel : il dit 7 jours.
        $this->assertSame(now()->addDays(7)->utc()->format(DATE_ATOM), $data['expires_at']);
    }

    public function test_seuil_propre_a_l_agence(): void
    {
        $data = $this->reserverChez(['booking_pending_expiry_hours' => 12]);

        $this->assertSame(now()->addHours(12)->utc()->format(DATE_ATOM), $data['response_deadline']);
    }

    public function test_seuil_superieur_a_expires_at_c_est_expires_at_qui_s_applique(): void
    {
        // 168 h = 7 jours pile : l'échéance d'`expires_at` (7 jours) n'est pas plus tardive.
        $data = $this->reserverChez(['booking_pending_expiry_hours' => 168]);

        $this->assertSame(now()->addDays(7)->utc()->format(DATE_ATOM), $data['response_deadline']);
    }

    public function test_expiration_de_l_agence_desactivee_reste_l_echeance_de_la_demande(): void
    {
        // 0 désactive le seuil de l'agence, PAS `ExpireBookings` : la demande expire encore à
        // `expires_at`. Annoncer « aucun délai » serait faux.
        $data = $this->reserverChez(['booking_pending_expiry_hours' => 0]);

        $this->assertSame(now()->addDays(7)->utc()->format(DATE_ATOM), $data['response_deadline']);
    }

    public function test_la_demande_publique_sans_expires_at_rend_le_seuil_de_l_agence(): void
    {
        // `/public/properties/{slug}/booking-request` crée la demande SANS `expires_at` et rend le
        // modèle tel qu'écrit : l'attribut y est absent parce que personne ne l'a posé, pas parce
        // qu'une sélection l'a omis. La garde du sparse fieldset ne doit pas l'y confondre.
        $agency = Agency::factory()->create(['settings' => ['booking_pending_expiry_hours' => 24]]);
        $property = Property::factory()->published()->create([
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
            'price' => '20000',
        ]);

        $data = $this->postJson("/api/public/properties/{$property->slug}/booking-request", [
            'start_date' => now()->addDays(2)->toDateString(),
            'end_date' => now()->addDays(5)->toDateString(),
            'guests' => 1,
        ])->assertCreated()->json('data');

        $this->assertNull($data['expires_at']);
        $this->assertSame(now()->addHours(24)->utc()->format(DATE_ATOM), $data['response_deadline']);
    }

    public function test_sans_agence_ni_expires_at_aucune_echeance(): void
    {
        // La demande publique (`/public/properties/{slug}/booking-request`) ne pose pas
        // `expires_at` ; sans agence, rien ne la fera expirer.
        $booking = Booking::factory()->create([
            'agency_id' => null,
            'status' => BookingStatus::Pending,
            'expires_at' => null,
        ]);

        $this->assertNull(app(BookingExpirationService::class)->responseDeadline($booking->fresh()));
    }

    public function test_une_demande_qui_n_est_plus_en_attente_n_a_plus_d_echeance(): void
    {
        $agency = Agency::factory()->create(['settings' => null]);
        foreach ([BookingStatus::Confirmed, BookingStatus::Cancelled, BookingStatus::Expired] as $statut) {
            $booking = Booking::factory()->create([
                'agency_id' => $agency->id,
                'status' => $statut,
                'expires_at' => now()->addDays(7),
            ]);

            $this->assertNull(app(BookingExpirationService::class)->responseDeadline($booking->fresh()), $statut->value);
        }
    }

    public function test_une_lecture_en_sparse_fieldset_peut_demander_l_echeance(): void
    {
        // La convention du front impose `fields[bookings]=…` à toute lecture. `expires_at` et
        // `expired_at` n'étaient pas des champs permis : la demande rendait 400, et l'échéance
        // n'était atteignable que par la réponse de création (vérificateur, 2026-09-24).
        $this->reserverChez(['booking_pending_expiry_hours' => 12]);

        $champs = implode(',', ['id', ...BookingResource::CHAMPS_DE_L_ECHEANCE]);
        $reponse = $this->getJson('/api/bookings?fields[bookings]='.$champs)->assertOk();

        $this->assertSame(now()->addHours(12)->utc()->format(DATE_ATOM), $reponse->json('data.0.response_deadline'));
        // Et les colonnes étrangères au fieldset restent hors de la réponse.
        $this->assertNull($reponse->json('data.0.reference_number'));
    }

    public function test_sous_un_sparse_fieldset_qui_omet_ses_colonnes_elle_vaut_null_plutot_qu_une_date_fausse(): void
    {
        $agency = Agency::factory()->create(['settings' => ['booking_pending_expiry_hours' => 12]]);
        $booking = Booking::factory()->create([
            'agency_id' => $agency->id,
            'status' => BookingStatus::Pending,
            'expires_at' => now()->addDays(7),
        ]);

        // Sans `agency_id` ni `created_at`, le calcul retomberait sur `expires_at` seul : 7 jours.
        $partiel = Booking::query()->select(['id', 'status', 'expires_at', 'expired_at'])->findOrFail($booking->id);

        $this->assertNull(BookingResource::make($partiel)->toArray(Request::create('/'))['response_deadline']);
    }
}
