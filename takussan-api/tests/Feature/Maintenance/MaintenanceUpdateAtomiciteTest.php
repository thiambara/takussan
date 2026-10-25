<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2010 (P184.02) — le `PATCH` d'une intervention s'écrit en entier ou pas du tout.
 *
 * `update` écrivait l'heure, la priorité et le coût réel (`fill()->save()`, `recordOwnerCost`)
 * avant `assign()`, hors transaction : sur une demande `completed`, l'assignation répondait 422
 * `maintenance.reassign_after_completion` et la ligne gardait le reste. Et le front y menait :
 * `can_assign` valait vrai sur `completed`.
 */
class MaintenanceUpdateAtomiciteTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_un_refus_d_assignation_n_ecrit_ni_l_heure_ni_la_priorite(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Completed, [
            'priority' => MaintenancePriority::Low,
            'scheduled_at' => null,
        ]);
        $autre = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => $autre->id,
            'scheduled_at' => now()->addDays(3)->toIso8601String(),
            'priority' => 'urgent',
        ])->assertStatus(422)->assertJsonPath('code', 'maintenance.reassign_after_completion');

        $mr->refresh();
        $this->assertNull($mr->scheduled_at);
        $this->assertSame(MaintenancePriority::Low, $mr->priority);
        $this->assertSame($provider->id, $mr->assigned_to);
    }

    public function test_un_refus_d_assignation_n_ecrit_ni_le_cout_reel_ni_l_accord_du_bailleur(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Completed, [
            'actual_cost' => null,
        ]);
        $autre = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'assigned_to' => $autre->id,
            'actual_cost' => 1000,
        ])->assertStatus(422)->assertJsonPath('code', 'maintenance.reassign_after_completion');

        $mr->refresh();
        $this->assertNull($mr->actual_cost);
        $this->assertArrayNotHasKey('owner_agreed_actual_cost', (array) $mr->metadata);
    }

    /** Témoin : sans changement d'assigné, le même `PATCH` sur `completed` s'écrit. */
    public function test_sans_reassignation_la_mise_a_jour_s_ecrit(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Completed, [
            'priority' => MaintenancePriority::Low,
        ]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['priority' => 'urgent'])->assertOk();

        $this->assertSame(MaintenancePriority::Urgent, $mr->refresh()->priority);
    }

    public function test_can_assign_est_faux_sur_une_intervention_terminee(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Completed);

        Sanctum::actingAs($landlord);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()
            ->assertJsonPath('data.abilities.can_assign', false);
    }

    /** Témoin : `can_assign` reste vrai pour le donneur d'ordre avant la fin des travaux. */
    public function test_can_assign_reste_vrai_en_cours(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress);

        Sanctum::actingAs($landlord);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()
            ->assertJsonPath('data.abilities.can_assign', true);
    }
}
