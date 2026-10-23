<?php

namespace Tests\Feature\Authorization;

use App\Models\Booking;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1930 (P190.02, décision du porteur) — `BookingPolicy::view` juge le bailleur du bien par
 * `BailleurDuBien` (TCK-1707), mais la liste gardait `orWhereHas('property', … user_id)` : l'agent
 * qui a saisi le bien, suspendu ou retiré, y voyait les réservations de ce bien, téléphone du client
 * compris. La clause « mes biens » suit la règle de `view`.
 */
class AgentCreateurListeDesReservationsTest extends TestCase
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

    private function reservationDuBienDe(User $auteur): Booking
    {
        $this->property->forceFill(['user_id' => $auteur->id])->save();

        return $this->bookingOfClient();
    }

    /** @return list<int> */
    private function listeDe(User $user): array
    {
        Sanctum::actingAs($user->fresh());

        return collect($this->getJson('/api/bookings')->assertOk()->json('data'))->pluck('id')->all();
    }

    public function test_l_agent_createur_suspendu_ne_liste_plus_les_reservations_du_bien(): void
    {
        $booking = $this->reservationDuBienDe($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertNotContains($booking->id, $this->listeDe($this->agent));
    }

    public function test_l_agent_createur_retire_ne_liste_plus_les_reservations_du_bien(): void
    {
        $booking = $this->reservationDuBienDe($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertNotContains($booking->id, $this->listeDe($this->agent));
    }

    /** Témoin : le bailleur du bien, bloqué, garde la liste (il garde la lecture). */
    public function test_le_bailleur_bloque_liste_encore_les_reservations_du_bien(): void
    {
        $booking = $this->reservationDuBienDe($this->landlord);
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);

        $this->assertContains($booking->id, $this->listeDe($this->landlord));
    }

    /** Témoin : l'agent actif liste au titre du personnel. */
    public function test_l_agent_createur_actif_liste_les_reservations_du_bien(): void
    {
        $booking = $this->reservationDuBienDe($this->agent);

        $this->assertContains($booking->id, $this->listeDe($this->agent));
    }
}
