<?php

namespace Tests\Feature\Authorization;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\ParticipantRole;
use App\Models\MaintenanceRequest;
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
 * TCK-2179 (P217.01, P217.02, décision du porteur) — `MaintenanceRequest::scopeVisibleTo` admettait
 * le créateur du bien sans rien juger d'autre, quand `view` le juge par `BailleurDuBien::est`
 * (TCK-1720) : l'agent qui a saisi le bien, suspendu ou retiré, gardait les interventions du bien
 * dans sa liste, et leurs fils dans `GET /api/conversations`, que `view` lui refuse. La clause du
 * bien passe par `BailleurDuBien::restreindre`, comme les listes de TCK-1928 et TCK-1930.
 */
class AgentCreateurListeDesInterventionsTest extends TestCase
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

    private function interventionDuBienDe(User $auteur): MaintenanceRequest
    {
        $this->property->forceFill(['user_id' => $auteur->id])->save();

        return MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'requester_id' => $this->client->id,
        ]);
    }

    private function filDe(MaintenanceRequest $intervention, User $participant): Conversation
    {
        $fil = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Intervention',
            'created_by' => $this->admin->id,
            'maintenance_request_id' => $intervention->id,
        ]);
        $fil->participants()->attach($participant->id, ['role' => ParticipantRole::Member->value, 'joined_at' => now()]);

        return $fil;
    }

    /** @return list<int> */
    private function interventionsListees(User $user): array
    {
        Sanctum::actingAs($user->fresh());

        return collect($this->getJson('/api/maintenance-requests')->assertOk()->json('data'))->pluck('id')->all();
    }

    /** @return list<int> */
    private function filsListes(User $user): array
    {
        Sanctum::actingAs($user->fresh());

        return collect($this->getJson('/api/conversations')->assertOk()->json('data'))->pluck('id')->all();
    }

    public function test_l_agent_createur_suspendu_ne_liste_plus_l_intervention_ni_son_fil(): void
    {
        $intervention = $this->interventionDuBienDe($this->agent);
        $fil = $this->filDe($intervention, $this->agent);

        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertFalse($this->agent->fresh()->can('view', $intervention->fresh()));
        $this->assertNotContains($intervention->id, $this->interventionsListees($this->agent));
        $this->assertNotContains($fil->id, $this->filsListes($this->agent));
    }

    public function test_l_agent_createur_retire_ne_liste_plus_l_intervention_ni_son_fil(): void
    {
        $intervention = $this->interventionDuBienDe($this->agent);
        $fil = $this->filDe($intervention, $this->agent);

        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertNotContains($intervention->id, $this->interventionsListees($this->agent));
        $this->assertNotContains($fil->id, $this->filsListes($this->agent));
    }

    /** Témoin : l'agent actif liste l'intervention au titre du personnel. */
    public function test_l_agent_createur_actif_liste_l_intervention(): void
    {
        $intervention = $this->interventionDuBienDe($this->agent);
        $fil = $this->filDe($intervention, $this->agent);

        $this->assertContains($intervention->id, $this->interventionsListees($this->agent));
        $this->assertContains($fil->id, $this->filsListes($this->agent));
    }

    /** Témoin : le bailleur du bien, bloqué compris, garde la liste et le fil (voie étroite de `BailleurDuBien`). */
    public function test_le_bailleur_du_bien_garde_la_liste_et_le_fil(): void
    {
        $intervention = $this->interventionDuBienDe($this->landlord);
        $fil = $this->filDe($intervention, $this->landlord);
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);

        $this->assertContains($intervention->id, $this->interventionsListees($this->landlord));
        $this->assertContains($fil->id, $this->filsListes($this->landlord));
    }
}
