<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\Capability;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-1720 (P160.02) — l'agent qui a SAISI le bien d'agence (`properties.user_id` = lui) n'en est
 * pas le bailleur : il commande, clôt et tranche un devis au titre de l'équipe, donc sous
 * `maintenance.assign` et `maintenance.close`. `isPrincipalFor` le faisait passer par la branche
 * « bailleur », que `isTeamPrincipalFor` excluait des capacités.
 *
 * Chaque refus a son témoin : le même agent créateur, titulaire de la capacité, passe.
 */
class AgentCreateurDonneurDOrdreTest extends TestCase
{
    use CreatesAgencyMembers, MaintenanceActors, RefreshDatabase;

    /** @return array{0: MaintenanceRequest, 1: User} */
    private function scenarioSaisiPar(bool $avecCapacites, MaintenanceStatus $status, array $attributes = []): array
    {
        ['mr' => $mr, 'agency' => $agency, 'property' => $property] = $this->maintenanceScenario($status, $attributes);
        $createur = $avecCapacites
            ? $this->agencyAgent($agency)
            : $this->agentWithout($agency, Capability::MaintenanceAssign, Capability::MaintenanceClose);
        $property->forceFill(['user_id' => $createur->id])->save();
        Sanctum::actingAs($createur);

        return [$mr, $createur];
    }

    public function test_l_agent_createur_sans_maintenance_assign_ne_commande_pas(): void
    {
        [$mr] = $this->scenarioSaisiPar(false, MaintenanceStatus::Open);
        $autre = $this->providerFor($mr->property->agency);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $autre->id])->assertForbidden();
        $this->assertNotSame($autre->id, $mr->refresh()->assigned_to);
    }

    public function test_l_agent_createur_avec_maintenance_assign_commande(): void
    {
        [$mr] = $this->scenarioSaisiPar(true, MaintenanceStatus::Open);
        $autre = $this->providerFor($mr->property->agency);

        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $autre->id])
            ->assertOk()
            ->assertJsonPath('data.assigned_to', $autre->id);
    }

    public function test_l_agent_createur_sans_maintenance_close_ne_clot_pas(): void
    {
        [$mr] = $this->scenarioSaisiPar(false, MaintenanceStatus::Completed);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'closed'])->assertForbidden();
        $this->assertSame(MaintenanceStatus::Completed, $mr->refresh()->status);
    }

    public function test_l_agent_createur_avec_maintenance_close_clot(): void
    {
        [$mr] = $this->scenarioSaisiPar(true, MaintenanceStatus::Completed);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'closed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'closed');
    }

    public function test_l_agent_createur_sans_maintenance_assign_ne_tranche_pas_le_devis(): void
    {
        [$mr] = $this->scenarioSaisiPar(false, MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 1000, 'quote_submitted_at' => now()]);

        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertForbidden();
        $this->assertSame(MaintenanceStatus::QuoteSubmitted, $mr->refresh()->status);
    }

    public function test_l_agent_createur_avec_maintenance_assign_tranche_le_devis(): void
    {
        [$mr] = $this->scenarioSaisiPar(true, MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 1000, 'quote_submitted_at' => now()]);

        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk();
        $this->assertSame(MaintenanceStatus::Approved, $mr->refresh()->status);
    }

    /** Le bailleur du bien commande toujours sans capacité d'agence. */
    public function test_le_bailleur_du_bien_commande_et_clot_sans_capacite(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Completed);
        Sanctum::actingAs($landlord);

        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'closed'])->assertOk();
    }
}
