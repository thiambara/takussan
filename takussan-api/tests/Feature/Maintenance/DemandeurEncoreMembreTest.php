<?php

namespace Tests\Feature\Maintenance;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use App\Policies\MaintenanceRequestPolicy;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Maintenance\MaintenanceStateMachine;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * P233.03 (TCK-2290) — ADR-0031, amendement du 2026-10-25 (D2) : la branche du DEMANDEUR d'une
 * intervention (`requester_id`) vaut si le bien est sans agence, si le demandeur est membre de
 * l'agence du bien (`isMemberAt`), ou s'il n'y a jamais tenu de profil de personnel, profils
 * supprimés compris. Trois sites de `MaintenanceRequestPolicy` (`view`, `respondToResolution`,
 * `actorsOf`) et la liste `MaintenanceRequest::scopeVisibleTo`.
 *
 * Avant : l'agent suspendu ou retiré qui avait ouvert l'intervention la lisait, la listait, et
 * confirmait ou contestait la réparation. Le locataire et le client demandeurs gardent tout.
 */
class DemandeurEncoreMembreTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $admin;

    private MaintenanceRequest $tenantRequest;

    private User $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        ['agency' => $this->agency, 'mr' => $this->tenantRequest, 'tenant' => $this->tenant] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()]);
        $this->agent = $this->agentOf($this->agency);
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    private function demandeDe(User $demandeur, ?Property $property = null): MaintenanceRequest
    {
        return MaintenanceRequest::factory()->create([
            'property_id' => ($property ?? $this->tenantRequest->property)->id,
            'requester_id' => $demandeur->id,
            'status' => MaintenanceStatus::Completed,
            'completed_at' => now(),
        ]);
    }

    /** @return list<int> */
    private function listeDe(User $user): array
    {
        Sanctum::actingAs($user->fresh());

        return collect($this->getJson('/api/maintenance-requests')->assertOk()->json('data'))
            ->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    private function assertPlusRien(User $demandeur, MaintenanceRequest $mr): void
    {
        $demandeur = $demandeur->fresh();
        $this->assertFalse($demandeur->can('view', $mr->fresh()), 'view');
        $this->assertNotContains(
            MaintenanceStateMachine::ACTOR_REQUESTER,
            app(MaintenanceRequestPolicy::class)->actorsOf($demandeur, $mr->fresh()),
            'encore acteur demandeur',
        );
        $this->assertFalse($demandeur->can('respondToResolution', [$mr->fresh(), MaintenanceStatus::Closed]), 'respondToResolution');
        $this->assertNotContains($mr->id, $this->listeDe($demandeur), 'encore listée');

        Sanctum::actingAs($demandeur);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertForbidden();
        $this->postJson("/api/maintenance-requests/{$mr->id}/confirm-resolution")->assertForbidden();
        $this->postJson("/api/maintenance-requests/{$mr->id}/contest-resolution", ['comment' => 'Encore une fuite'])->assertForbidden();
        $this->assertSame(MaintenanceStatus::Completed, $mr->fresh()->status);
    }

    private function assertGardeTout(User $demandeur, MaintenanceRequest $mr): void
    {
        $demandeur = $demandeur->fresh();
        $this->assertContains($mr->id, $this->listeDe($demandeur), 'absente de la liste');

        Sanctum::actingAs($demandeur);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();
        $this->postJson("/api/maintenance-requests/{$mr->id}/confirm-resolution")
            ->assertOk()->assertJsonPath('data.status', 'closed');
    }

    public function test_l_agent_demandeur_suspendu_ne_lit_ne_liste_ni_ne_tranche_plus_sa_demande(): void
    {
        $mr = $this->demandeDe($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertPlusRien($this->agent, $mr);
    }

    public function test_l_agent_demandeur_retire_ne_lit_ne_liste_ni_ne_tranche_plus_sa_demande(): void
    {
        $mr = $this->demandeDe($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertPlusRien($this->agent, $mr);
    }

    /** Témoin : l'agent actif garde sa demande. */
    public function test_temoin_l_agent_demandeur_actif_garde_sa_demande(): void
    {
        $this->assertGardeTout($this->agent, $this->demandeDe($this->agent));
    }

    /** Témoin : le locataire demandeur garde tout, la règle ne vise que le personnel. */
    public function test_temoin_le_locataire_demandeur_garde_sa_demande(): void
    {
        $this->assertGardeTout($this->tenant, $this->tenantRequest);
    }

    /** Témoin : le bien sans agence reste au demandeur, même agent suspendu ailleurs. */
    public function test_temoin_un_bien_sans_agence_reste_au_demandeur_parti(): void
    {
        $particulier = User::factory()->create();
        $bienPrive = Property::factory()->create(['user_id' => $particulier->id, 'agency_id' => null]);
        $mr = $this->demandeDe($this->agent, $bienPrive);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertGardeTout($this->agent, $mr);
    }

    /** Témoin : l'ancien agent d'une AUTRE agence, locataire ici, n'a jamais été personnel de celle-ci. */
    public function test_temoin_l_ancien_agent_d_une_autre_agence_garde_sa_demande_de_locataire(): void
    {
        $autre = Agency::factory()->create();
        AgentProfile::query()->create(['user_id' => $this->tenant->id, 'agency_id' => $autre->id]);
        AgentProfile::query()->where('user_id', $this->tenant->id)->delete();

        $this->assertGardeTout($this->tenant, $this->tenantRequest);
    }

    /** Témoin : un profil d'agent en brouillon (invitation non acceptée) n'a jamais été tenu. */
    public function test_temoin_le_locataire_invite_comme_agent_garde_sa_demande(): void
    {
        AgentProfile::query()->create([
            'user_id' => $this->tenant->id,
            'agency_id' => $this->agency->id,
            'status' => AgentProfileStatus::Draft->value,
        ]);

        $this->assertGardeTout($this->tenant, $this->tenantRequest);
    }
}
