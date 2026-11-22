<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\BookingCounterOffer;
use App\Models\Customer;
use App\Models\Enums\BookingKind;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CounterOfferStatus;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2873 (ADR-0110 § 9, rang réservé par TCK-2894) — le jalon `counter_offer` du fil de la fiche
 * client : une entrée par contre-offre de l'agence, à l'instant où elle est faite, portant sa
 * réservation (`id`), son prix, sa validité et son état COURANT ; aux seuls lecteurs des
 * réservations du fil (personnel de l'agence de la fiche), et pour les seules réservations de
 * cette agence.
 */
class CustomerTimelineCounterOfferTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $admin;

    private User $bailleurAuteur;

    private Customer $fiche;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->admin = $this->personnel($this->agence, 'agency_admin');
        $this->bailleurAuteur = $this->bailleur($this->agence);
        $this->fiche = $this->ficheClient($this->agence, null, ['added_by_id' => $this->bailleurAuteur->id]);
        $this->bien = $this->bienDe($this->agence, $this->bailleur($this->agence));
        Activity::query()->delete();
    }

    private function offre(array $attributes = []): Booking
    {
        return Booking::factory()->create($attributes + [
            'property_id' => $this->bien->id,
            'agency_id' => $this->agence->id,
            'customer_id' => $this->fiche->id,
            'kind' => BookingKind::Offer,
            'status' => BookingStatus::Pending,
            'total_amount' => 85000000,
        ]);
    }

    private function contreOffre(Booking $booking, string $montant, CounterOfferStatus $status = CounterOfferStatus::Pending): BookingCounterOffer
    {
        return BookingCounterOffer::create([
            'booking_id' => $booking->id, 'amount' => $montant, 'valid_until' => now()->addDays(3)->toDateString(),
            'created_by_id' => $this->admin->id, 'status' => $status->value,
        ]);
    }

    public function test_chaque_contre_offre_entre_au_fil_avec_sa_reservation_son_prix_et_son_etat(): void
    {
        Carbon::setTestNow('2026-11-10 09:00:00');
        $offre = $this->offre();
        Carbon::setTestNow('2026-11-11 10:00:00');
        $premiere = $this->contreOffre($offre, '92000000', CounterOfferStatus::Superseded);
        Carbon::setTestNow('2026-11-12 10:00:00');
        $seconde = $this->contreOffre($offre, '90000000');

        Sanctum::actingAs($this->admin);
        $data = $this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=booking")->assertOk()->json('data');
        Carbon::setTestNow();

        $this->assertSame(
            ['booking:counter_offer', 'booking:counter_offer', 'booking:created'],
            array_map(fn (array $e) => $e['type'].':'.$e['milestone'], $data),
        );
        [$recente, $ancienne, $deposee] = $data;
        // L'entrée est celle de la réservation, à l'instant de la contre-offre.
        $this->assertSame([$offre->id, $offre->id, $offre->id], [$recente['id'], $ancienne['id'], $deposee['id']]);
        $this->assertSame('2026-11-12T10:00:00+00:00', $recente['at']);
        $this->assertSame('2026-11-11T10:00:00+00:00', $ancienne['at']);
        $this->assertSame(['id' => $seconde->id, 'amount' => '90000000.00', 'valid_until' => '2026-11-15', 'status' => 'pending'], $recente['counter_offer']);
        $this->assertSame([$premiere->id, 'superseded'], [$ancienne['counter_offer']['id'], $ancienne['counter_offer']['status']]);
        // Le montant de l'offre reste le sien : la contre-offre porte le sien à part.
        $this->assertSame('85000000.00', $recente['amount']);
        $this->assertSame('offer', $recente['kind']);
    }

    public function test_ni_au_bailleur_auteur_ni_pour_une_offre_d_une_autre_agence(): void
    {
        $this->contreOffre($this->offre(), '90000000');
        $ailleurs = $this->agence();
        $this->contreOffre($this->offre(['agency_id' => $ailleurs->id, 'property_id' => $this->bienDe($ailleurs)->id]), '50000000');

        Sanctum::actingAs($this->bailleurAuteur);
        $this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=booking")->assertOk()->assertJsonPath('meta.total', 0);

        Sanctum::actingAs($this->admin);
        $data = $this->getJson("/api/customers/{$this->fiche->id}/timeline?filter[type]=booking")->assertOk()->json('data');
        // La contre-offre et le dépôt de l'offre de CETTE agence, rien de l'autre.
        $this->assertSame(['counter_offer', 'created'], array_column($data, 'milestone'));
        $this->assertSame('90000000.00', $data[0]['counter_offer']['amount']);
    }
}
