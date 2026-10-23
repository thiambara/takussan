<?php

namespace Tests\Feature\Notifications;

use App\Models\Enums\BookingStatus;
use App\Models\User;
use App\Notifications\BookingExpiredNotification;
use App\Services\Booking\BookingExpirationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1724 (P160.04, délégué 2026-10-22) — l'avis d'expiration `agent` part à l'équipe de
 * `BookingStakeholders::for`, comme la demande et l'annulation, et non plus au seul premier trouvé
 * (`createurDestinataire`, c'est-à-dire le bailleur sur son propre bien). Le client garde son avis
 * `tenant` ; le bailleur garde le sien, à la même perspective ; les replis de `resolveAgent` ne
 * servent que si l'équipe est vide.
 */
class ExpirationPrevientLEquipeTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
    }

    private function avisA(User $user, string $perspective): int
    {
        return Notification::sent($user, BookingExpiredNotification::class)
            ->filter(fn (BookingExpiredNotification $n) => $n->recipientType === $perspective)
            ->count();
    }

    public function test_l_agent_collaborateur_auteur_de_la_reservation_recoit_l_avis(): void
    {
        $booking = $this->bookingOfClient(['created_by_id' => $this->agent->id, 'status' => BookingStatus::Pending]);

        $this->assertTrue(app(BookingExpirationService::class)->expire($booking, 'manual'));

        $this->assertSame(1, $this->avisA($this->agent, 'agent'));
        $this->assertSame(1, $this->avisA($this->landlord, 'agent'));
        $this->assertSame(1, $this->avisA($this->client, 'tenant'));
        $this->assertSame(0, $this->avisA($this->client, 'agent'));
    }

    /** Le collaborateur prévenu sans être l'auteur : l'équipe entière, comme à la demande. */
    public function test_un_collaborateur_qui_n_est_pas_l_auteur_recoit_l_avis(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Pending]);

        app(BookingExpirationService::class)->expire($booking, 'manual');

        $this->assertSame(1, $this->avisA($this->agent, 'agent'));
        $this->assertSame(1, $this->avisA($this->landlord, 'agent'));
    }

    /** Équipe vide : le repli de l'admin principal de l'agence sert encore. */
    public function test_sans_equipe_l_admin_principal_est_prevenu(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $this->agency->forceFill(['primary_admin_id' => $admin->id])->save();
        $this->property->collaborators()->delete();
        $this->property->forceFill(['user_id' => User::factory()->create()->id])->save();
        $booking = $this->bookingOfClient(['status' => BookingStatus::Pending]);

        app(BookingExpirationService::class)->expire($booking, 'manual');

        $this->assertSame(1, $this->avisA($admin, 'agent'));
        $this->assertSame(1, $this->avisA($this->client, 'tenant'));
    }
}
