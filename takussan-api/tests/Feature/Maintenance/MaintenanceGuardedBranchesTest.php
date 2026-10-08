<?php

namespace Tests\Feature\Maintenance;

use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 (verif-592, mineurs 2 à 6) — cinq branches justes qu'aucun test ne gardait : l'ablation
 * du vérificateur (X5, X7, X14, X25, X11) laissait toute la suite verte. Chaque test ci-dessous est
 * le rouge de l'une d'elles.
 */
class MaintenanceGuardedBranchesTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** X5 — `confirm-resolution` est une seconde route de clôture : elle exige `maintenance.close`. */
    public function test_confirming_a_resolution_needs_the_close_capability(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['completed_at' => now()]);
        $role = AgencyRole::factory()->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::MaintenanceAssign])
            ->create(['agency_id' => $agency->id]);
        $agent = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $agent->id, 'agency_id' => $agency->id, 'agency_role_id' => $role->id]);

        Sanctum::actingAs($agent);
        $this->postJson("/api/maintenance-requests/{$mr->id}/confirm-resolution")->assertForbidden();

        $this->assertSame(MaintenanceStatus::Completed, $mr->refresh()->status);
    }

    /** X7 — un prestataire qui n'a pas accepté ne fixe pas de rendez-vous chez le locataire. */
    public function test_an_unaccepted_provider_cannot_schedule(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($provider);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['scheduled_at' => now()->addDay()->toIso8601String()])
            ->assertForbidden();

        $this->assertNull($mr->refresh()->scheduled_at);
    }

    /** X14 — démarrée par le donneur d'ordre, l'intervention ne se refuse plus, même sans acceptation. */
    public function test_a_request_started_by_the_principal_cannot_be_declined(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Assigned);

        Sanctum::actingAs($landlord);
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'in_progress'])->assertOk();

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'pas disponible'])->assertUnprocessable();

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::InProgress, $mr->status);
        $this->assertSame($provider->id, $mr->assigned_to);
        $this->assertNull($mr->accepted_at);
    }

    /** X25 — `prohibited` laisse passer `null` : le contrôleur retire les champs d'état du corps. */
    public function test_null_state_fields_write_nothing(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['started_at' => now()]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['status' => null, 'started_at' => null, 'completed_at' => null])->assertOk();

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::InProgress, $mr->status);
        $this->assertNotNull($mr->started_at);
    }

    /** X11 — un devis ÉGAL au plafond du bailleur s'approuve directement (ADR-0037 : « au-delà »). */
    public function test_a_quote_equal_to_the_threshold_is_approved_directly(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(
            MaintenanceStatus::QuoteSubmitted,
            ['quote_amount' => 50000, 'quote_currency' => 'XOF', 'quote_submitted_at' => now()],
        );
        OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)
            ->update(['works_approval_threshold' => 50000]);

        Sanctum::actingAs($this->agentOf($agency));
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');
    }
}
