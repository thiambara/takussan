<?php

namespace Tests\Feature\Agency;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-1709 (P153.03) — `MaintenanceRequestPolicy::isPrincipalFor` ne tient plus `property.user_id`
 * pour titre sur un bien d'agence quand l'auteur n'y a plus aucun profil : l'agent qui a saisi le
 * bien, retiré en `leave_unassigned`, n'est plus donneur d'ordre de ses interventions.
 */
class MembreRetireInterventionsTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_l_agent_retire_n_est_plus_donneur_d_ordre_des_interventions_du_bien_qu_il_a_saisi(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'property' => $property] = $this->maintenanceScenario(MaintenanceStatus::Open);
        $agent = $this->agentOf($agency);
        $property->forceFill(['user_id' => $agent->id])->save();
        $enAttente = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'status' => MaintenanceStatus::AwaitingOwner,
        ]);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        app(AgencyMemberRemovalService::class)->remove($agency, $agent, $admin, leaveUnassigned: true);

        $retire = $agent->fresh();
        foreach (['view', 'update', 'actAsPrincipal', 'decideQuote'] as $ability) {
            $this->assertFalse($retire->can($ability, $mr->fresh()), $ability);
        }
        $this->assertFalse($retire->can('decideQuote', $enAttente->fresh()), 'decideQuote en awaiting_owner');

        Sanctum::actingAs($retire);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertForbidden();
    }

    /** Témoin : le bailleur auteur du bien reste donneur d'ordre, et tranche en `awaiting_owner`. */
    public function test_le_bailleur_auteur_reste_donneur_d_ordre(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'property' => $property] = $this->maintenanceScenario(MaintenanceStatus::Open);
        $enAttente = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'status' => MaintenanceStatus::AwaitingOwner,
        ]);

        foreach (['view', 'update', 'actAsPrincipal'] as $ability) {
            $this->assertTrue($landlord->can($ability, $mr), $ability);
        }
        $this->assertTrue($landlord->can('decideQuote', $enAttente), 'decideQuote en awaiting_owner');

        Sanctum::actingAs($landlord);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();
    }
}
