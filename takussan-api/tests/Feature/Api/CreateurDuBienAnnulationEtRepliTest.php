<?php

namespace Tests\Feature\Api;

use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CancellationBy;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyCollaborator;
use App\Services\Booking\BookingRefundTaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-1726 (P160.06) — deux lectures de `properties.user_id` comme « le bailleur » :
 *
 * - `BookingService::cancel` écrivait `cancellation_by = owner` pour l'agent qui a SAISI le bien :
 *   il annule au titre du personnel, `agent` (même prédicat que TCK-1718, `BailleurDuBien`) ;
 * - `BookingRefundTaskService::assigneeFor` assignait en dernier repli le créateur tel quel : la
 *   tâche allait à l'agent suspendu ou parti, là où TCK-1316 passe ailleurs par
 *   `createurDestinataire`.
 */
class CreateurDuBienAnnulationEtRepliTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->buildStakeholders();
    }

    public function test_l_agent_createur_annule_en_agent(): void
    {
        $createur = $this->agencyAgent($this->agency);
        $this->property->forceFill(['user_id' => $createur->id])->save();
        $booking = $this->bookingOfClient(['status' => BookingStatus::Pending]);

        Sanctum::actingAs($createur);
        $this->postJson("/api/bookings/{$booking->id}/cancel")->assertOk();

        $this->assertSame(CancellationBy::Agent, $booking->fresh()->cancellation_by);
    }

    public function test_le_bailleur_annule_toujours_en_proprietaire(): void
    {
        $booking = $this->bookingOfClient(['status' => BookingStatus::Pending]);

        Sanctum::actingAs($this->landlord);
        $this->postJson("/api/bookings/{$booking->id}/cancel")->assertOk();

        $this->assertSame(CancellationBy::Owner, $booking->fresh()->cancellation_by);
    }

    /** Ni auteur du personnel, ni collaborateur, ni admin : le créateur suspendu n'est pas assigné. */
    public function test_le_dernier_repli_ecarte_l_agent_createur_suspendu(): void
    {
        $createur = $this->agencyAgent($this->agency);
        AgentProfile::query()->where('user_id', $createur->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $this->property->forceFill(['user_id' => $createur->id])->save();
        PropertyCollaborator::query()->where('property_id', $this->property->id)->delete();

        $this->assertNull(app(BookingRefundTaskService::class)->assigneeFor($this->bookingOfClient()));
    }

    /** Le même repli garde le bailleur du bien, quand personne d'autre ne suit la réservation. */
    public function test_le_dernier_repli_garde_le_bailleur(): void
    {
        PropertyCollaborator::query()->where('property_id', $this->property->id)->delete();

        $this->assertSame($this->landlord->id, app(BookingRefundTaskService::class)->assigneeFor($this->bookingOfClient())?->id);
    }
}
