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
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * P48.03 (TCK-2352, décision du porteur du 2026-10-25) — le bail tiré d'une candidature.
 *
 * `StoreLeaseRequest` acceptait `booking_id`, borné au seul bien : rien ne vérifiait que le
 * locataire était le client de la réservation, et la réservation restait `confirmed`, ses nuits
 * bloquées pour toute autre confirmation (`PropertyAvailabilityService`). Désormais le locataire
 * est le client de la réservation, et le bail la passe à `completed`, ce qui libère ses nuits.
 *
 * TCK-2734 (décision 7 du porteur, 2026-11-12) — elle passe `completed` quand le bail PART (envoi en
 * signature, ou signature papier d'un brouillon), plus à la création du brouillon : un brouillon
 * abandonné ne touche à rien.
 */
class BailTireDUneCandidatureTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private Property $bien;

    private Customer $candidat;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Bus::fake([GenerateLeasePaymentSchedule::class]);
        $this->mock(DocumentPdfService::class, function ($mock) {
            $mock->shouldReceive('render')->andReturnUsing(fn (string $template, array $data) => view($template, $data)->render());
        });
        $this->agence = Agency::factory()->create();
        $this->agent = $this->agencyAgent($this->agence);
        $this->bien = Property::factory()->published()->create([
            'agency_id' => $this->agence->id,
            'visibility' => PropertyVisibility::Public,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Monthly,
            'price' => 250_000,
        ]);
        // Un compte au candidat : l'envoi en signature l'exige (ADR-0042 § 5).
        $this->candidat = Customer::factory()->create(['agency_id' => $this->agence->id, 'user_id' => User::factory()->create()->id]);
    }

    private function candidature(BookingStatus $status, ?Customer $client = null): Booking
    {
        return Booking::factory()->create([
            'property_id' => $this->bien->id,
            'agency_id' => $this->agence->id,
            'customer_id' => ($client ?? $this->candidat)->id,
            'status' => $status,
            'start_date' => now()->addDays(5)->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
        ]);
    }

    /** @return array<string, mixed> */
    private function bail(Booking $reservation, Customer $locataire): array
    {
        return [
            'property_id' => $this->bien->id,
            'tenant_id' => $locataire->id,
            'booking_id' => $reservation->id,
            'type' => 'residential_rent',
            'start_date' => now()->addDays(5)->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => 250000,
            'deposit_amount' => 0,
        ];
    }

    public function test_le_bail_d_une_candidature_confirmee_la_termine_et_libere_ses_nuits(): void
    {
        $reservation = $this->candidature(BookingStatus::Confirmed);
        // Un séjour sur les mêmes nuits : la règle des nuits le juge, aucune fermeture ne le touche.
        $sejour = $this->candidature(BookingStatus::Pending, Customer::factory()->create(['agency_id' => $this->agence->id]));
        $sejour->forceFill(['kind' => BookingKind::Stay])->save();
        $voisine = $this->candidature(BookingStatus::Pending, Customer::factory()->create(['agency_id' => $this->agence->id]));
        $voisine->forceFill(['kind' => BookingKind::Application])->save();

        $id = $this->actingAsApi($this->agent)
            ->postJson('/api/leases', $this->bail($reservation, $this->candidat))
            ->assertCreated()
            ->json('data.id');

        $this->assertSame($reservation->id, Lease::query()->findOrFail($id)->booking_id);
        // TCK-2734 (décision 7) — le brouillon ne la termine pas : ses nuits bloquent encore.
        $this->assertSame(BookingStatus::Confirmed, $reservation->refresh()->status);
        $this->postJson("/api/bookings/{$sejour->id}/confirm")->assertStatus(422)->assertJsonPath('code', 'booking.dates_overlap');
        $this->assertSame(BookingStatus::Pending, $voisine->refresh()->status);

        $this->postJson("/api/leases/{$id}/signature-request")->assertOk();
        $this->assertSame(BookingStatus::Completed, $reservation->refresh()->status);
        // L'envoi clôt aussi la candidature voisine : « non retenue ».
        $this->assertSame(BookingStatus::Rejected, $voisine->refresh()->status);

        // Ses nuits ne bloquent plus : le séjour, sur les mêmes dates, se confirme.
        $this->postJson("/api/bookings/{$sejour->id}/confirm")->assertOk();
        $this->assertSame(BookingStatus::Confirmed, $sejour->refresh()->status);
    }

    public function test_le_locataire_doit_etre_le_client_de_la_reservation(): void
    {
        $reservation = $this->candidature(BookingStatus::Confirmed);
        $autreFiche = Customer::factory()->create(['agency_id' => $this->agence->id]);

        $this->actingAsApi($this->agent)
            ->postJson('/api/leases', $this->bail($reservation, $autreFiche))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['tenant_id']);

        $this->assertSame(0, Lease::query()->count());
        $this->assertSame(BookingStatus::Confirmed, $reservation->refresh()->status);
    }

    public function test_une_candidature_en_attente_se_termine_aussi(): void
    {
        $reservation = $this->candidature(BookingStatus::Pending);

        $id = $this->actingAsApi($this->agent)
            ->postJson('/api/leases', $this->bail($reservation, $this->candidat))
            ->assertCreated()
            ->json('data.id');
        $this->assertSame(BookingStatus::Pending, $reservation->refresh()->status, 'le brouillon ne la termine pas');

        $this->postJson("/api/leases/{$id}/signature-request")->assertOk();
        $this->assertSame(BookingStatus::Completed, $reservation->refresh()->status);
    }

    /** Témoin : une réservation déjà close garde son statut ; le bail s'y rattache comme avant. */
    public function test_temoin_une_reservation_close_garde_son_statut(): void
    {
        $reservation = $this->candidature(BookingStatus::Cancelled);

        $this->actingAsApi($this->agent)
            ->postJson('/api/leases', $this->bail($reservation, $this->candidat))
            ->assertCreated();

        $this->assertSame(BookingStatus::Cancelled, $reservation->refresh()->status);
    }

    /** Témoin : sans réservation, rien ne change. */
    public function test_temoin_sans_reservation_rien_ne_change(): void
    {
        $reservation = $this->candidature(BookingStatus::Confirmed);
        $donnees = $this->bail($reservation, $this->candidat);
        unset($donnees['booking_id']);

        $this->actingAsApi($this->agent)->postJson('/api/leases', $donnees)->assertCreated();

        $this->assertSame(BookingStatus::Confirmed, $reservation->refresh()->status);
    }
}
