<?php

namespace Tests\Feature\Agency;

use App\Models\Enums\BookingStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1707 (P153.02) — la branche « propriétaire du bien » de `BookingPolicy` ne lit plus le seul
 * `property.user_id` : sur un bien d'agence, l'auteur doit y avoir un profil de bailleur. L'agent qui
 * a saisi le bien, retiré en `leave_unassigned`, ne lit plus ses réservations (téléphone du client
 * compris) et ne les confirme ni ne les annule plus.
 */
class MembreRetireReservationsTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
    }

    public function test_l_agent_retire_ne_lit_ni_ne_confirme_les_reservations_du_bien_qu_il_a_saisi(): void
    {
        $this->property->forceFill(['user_id' => $this->agent->id])->save();
        $booking = $this->bookingOfClient();
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $this->agency->id]);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $admin, leaveUnassigned: true);

        $retire = $this->agent->fresh();
        foreach (['view', 'update', 'validate', 'cancel'] as $ability) {
            $this->assertFalse($retire->can($ability, $booking->fresh()), $ability);
        }

        Sanctum::actingAs($retire);
        $this->getJson("/api/bookings/{$booking->id}")->assertForbidden();
        $this->postJson("/api/bookings/{$booking->id}/confirm")->assertForbidden();
        $this->assertSame(BookingStatus::Pending, $booking->fresh()->status);
    }

    /** Témoin : le bailleur auteur du bien lit et confirme ; suspendu, il garde la lecture (ADR-0031 §2). */
    public function test_le_bailleur_auteur_garde_ses_reservations_et_suspendu_la_lecture(): void
    {
        $booking = $this->bookingOfClient();
        foreach (['view', 'update', 'validate', 'cancel'] as $ability) {
            $this->assertTrue($this->landlord->can($ability, $booking), $ability);
        }

        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);
        $suspendu = $this->landlord->fresh();
        Sanctum::actingAs($suspendu);
        $this->getJson("/api/bookings/{$booking->id}")->assertOk();
        $this->assertFalse($suspendu->can('validate', $booking->fresh()));
    }
}
