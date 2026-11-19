<?php

namespace Tests\Feature\Messaging\Engagements;

use App\Models\Booking;
use App\Models\Commitment;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\MessageType;
use App\Models\Enums\PropertyStatus;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Observers\AnnuleLesEngagementsDeSonObjet;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\MaintenanceActors;
use Tests\Support\SceneDEngagement;
use Tests\TestCase;

/**
 * TCK-2969 (ADR-0130 § 7) — un objet clos annule ses engagements en cours (AC4). Un cas par ligne de
 * {@see AnnuleLesEngagementsDeSonObjet::CLOS}, et la suppression ; une réservation `completed` n'annule
 * rien, un engagement `kept` reste `kept`. La clôture passe par le MODÈLE (`update`, `save`, `delete`),
 * le chemin de chaque écrivain relevé par l'ADR.
 */
class ClotureDesEngagementsTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, SceneDEngagement;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLaScene();
    }

    private function surObjet(Model $objet, string $type, CommitmentStatus $status = CommitmentStatus::Open): Commitment
    {
        return $this->engagement(['object_type' => $type, 'object_id' => $objet->getKey(), 'status' => $status]);
    }

    private function assertAnnuleParClotureDeLObjet(Commitment $engagement): void
    {
        $engagement->refresh();
        $this->assertSame(CommitmentStatus::Cancelled, $engagement->status);
        $this->assertSame(Commitment::ANNULE_OBJET_CLOS, $engagement->cancel_reason);
        $this->assertNotNull($engagement->cancelled_at);

        $evenement = Message::query()
            ->where('conversation_id', $engagement->conversation_id)
            ->where('type', MessageType::Event->value)
            ->where('content', 'commitment.cancelled')
            ->sole();
        $this->assertEquals(['type' => 'commitment', 'id' => $engagement->id], $evenement->metadata['object']);
        $this->assertSame(['reason' => 'object_closed'], $evenement->metadata['data']);
    }

    private function assertIntact(Commitment $engagement, CommitmentStatus $attendu = CommitmentStatus::Open): void
    {
        $this->assertSame($attendu, $engagement->refresh()->status);
        $this->assertSame(0, Message::query()->where('content', 'commitment.cancelled')->count());
    }

    public function test_une_intervention_close_annule_ses_engagements(): void
    {
        $intervention = MaintenanceRequest::factory()->create(['property_id' => $this->bien->id, 'status' => MaintenanceStatus::Completed]);
        $engagement = $this->surObjet($intervention, 'maintenance_request', CommitmentStatus::Proposed);

        $intervention->status = MaintenanceStatus::Closed;
        $intervention->save();

        $this->assertAnnuleParClotureDeLObjet($engagement);
    }

    public function test_une_intervention_annulee_annule_ses_engagements(): void
    {
        $intervention = MaintenanceRequest::factory()->create(['property_id' => $this->bien->id, 'status' => MaintenanceStatus::Open]);
        $engagement = $this->surObjet($intervention, 'maintenance_request');

        $intervention->status = MaintenanceStatus::Cancelled;
        $intervention->save();

        $this->assertAnnuleParClotureDeLObjet($engagement);
    }

    public function test_un_bail_expire_annule_ses_engagements(): void
    {
        $bail = Lease::factory()->create(['property_id' => $this->bien->id, 'agency_id' => $this->agence->id, 'status' => LeaseStatus::Active]);
        $engagement = $this->surObjet($bail, 'lease');

        $bail->update(['status' => LeaseStatus::Expired]);

        $this->assertAnnuleParClotureDeLObjet($engagement);
    }

    public function test_une_reservation_annulee_annule_ses_engagements(): void
    {
        $reservation = Booking::factory()->create(['property_id' => $this->bien->id, 'agency_id' => $this->agence->id, 'status' => BookingStatus::Confirmed]);
        $engagement = $this->surObjet($reservation, 'booking');

        $reservation->update(['status' => BookingStatus::Cancelled]);

        $this->assertAnnuleParClotureDeLObjet($engagement);
    }

    public function test_une_reservation_terminee_n_annule_rien(): void
    {
        $reservation = Booking::factory()->create(['property_id' => $this->bien->id, 'agency_id' => $this->agence->id, 'status' => BookingStatus::Confirmed]);
        $engagement = $this->surObjet($reservation, 'booking');

        $reservation->update(['status' => BookingStatus::Completed]);

        $this->assertIntact($engagement);
    }

    public function test_un_bien_archive_annule_ses_engagements(): void
    {
        $engagement = $this->surObjet($this->bien, 'property');

        $this->bien->forceFill(['status' => PropertyStatus::Archived])->save();

        $this->assertAnnuleParClotureDeLObjet($engagement);
    }

    public function test_un_objet_supprime_annule_ses_engagements(): void
    {
        $intervention = MaintenanceRequest::factory()->create(['property_id' => $this->bien->id, 'status' => MaintenanceStatus::Open]);
        $engagement = $this->surObjet($intervention, 'maintenance_request');

        $intervention->delete();

        $this->assertAnnuleParClotureDeLObjet($engagement);
    }

    public function test_un_engagement_tenu_reste_tenu_et_un_autre_objet_n_est_pas_touche(): void
    {
        $intervention = MaintenanceRequest::factory()->create(['property_id' => $this->bien->id, 'status' => MaintenanceStatus::Open]);
        $tenu = $this->surObjet($intervention, 'maintenance_request', CommitmentStatus::Kept);
        $ailleurs = $this->surObjet($this->bien, 'property');

        $intervention->status = MaintenanceStatus::Cancelled;
        $intervention->save();

        $this->assertIntact($tenu, CommitmentStatus::Kept);
        $this->assertIntact($ailleurs);
    }
}
