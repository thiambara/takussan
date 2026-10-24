<?php

namespace Tests\Feature\Authorization;

use App\Models\BookingPayment;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * P233.01 (TCK-2241) — `PaymentController::history` listait les acomptes des réservations dont
 * l'appelant est l'auteur (`created_by_id`) sans juger l'appartenance : l'agent suspendu ou retiré
 * lisait encore les acomptes des réservations qu'il avait créées, que `BookingPolicy::view` lui
 * refuse depuis TCK-2196. La branche suit `BookingController::index` : auteur, et réservation sans
 * agence ou d'une agence dont il est encore membre (ADR-0031, amendement du 2026-10-24, B.2).
 */
class AuteurDeLaReservationHistoriqueDesAcomptesTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    /** Réservation de l'agence créée par l'agent ; le bien n'est pas à lui. */
    private function acompteDUneReservationCreeePar(User $auteur, bool $sansAgence = false): BookingPayment
    {
        $booking = $this->bookingOfClient([
            'created_by_id' => $auteur->id,
            'agency_id' => $sansAgence ? null : $this->agency->id,
        ]);

        return $this->paidDeposit($booking);
    }

    /** @return list<int> */
    private function historiqueDe(User $user): array
    {
        Sanctum::actingAs($user->fresh());

        return collect($this->getJson('/api/payments/history')->assertOk()->json('data'))
            ->where('source', 'booking')->pluck('id')->all();
    }

    public function test_l_auteur_suspendu_ne_voit_plus_l_acompte_de_sa_reservation(): void
    {
        $payment = $this->acompteDUneReservationCreeePar($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertFalse($this->agent->fresh()->can('view', $payment->booking->fresh()), 'prémisse : la policy refuse');
        $this->assertNotContains($payment->id, $this->historiqueDe($this->agent), 'acompte listé à l\'auteur suspendu');
    }

    public function test_l_auteur_retire_ne_voit_plus_l_acompte_de_sa_reservation(): void
    {
        $payment = $this->acompteDUneReservationCreeePar($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertFalse($this->agent->fresh()->can('view', $payment->booking->fresh()), 'prémisse : la policy refuse');
        $this->assertNotContains($payment->id, $this->historiqueDe($this->agent), 'acompte listé à l\'auteur retiré');
    }

    /** Témoin : l'auteur actif garde l'acompte. */
    public function test_temoin_l_auteur_actif_garde_l_acompte(): void
    {
        $payment = $this->acompteDUneReservationCreeePar($this->agent);

        $this->assertContains($payment->id, $this->historiqueDe($this->agent));
    }

    /** Témoin : l'auteur d'une réservation sans agence la garde, sans appartenance à juger. */
    public function test_temoin_l_auteur_d_une_reservation_sans_agence_garde_l_acompte(): void
    {
        $auteur = User::factory()->create();
        $payment = $this->acompteDUneReservationCreeePar($auteur, sansAgence: true);

        $this->assertContains($payment->id, $this->historiqueDe($auteur));
    }

    /** Témoin : le client et le bailleur du bien gardent l'acompte quand l'auteur est parti. */
    public function test_temoin_le_client_et_le_bailleur_gardent_l_acompte(): void
    {
        $payment = $this->acompteDUneReservationCreeePar($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertContains($payment->id, $this->historiqueDe($this->client));
        $this->assertContains($payment->id, $this->historiqueDe($this->landlord));
    }
}
