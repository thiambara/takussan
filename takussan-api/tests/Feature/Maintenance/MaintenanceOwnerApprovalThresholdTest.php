<?php

namespace Tests\Feature\Maintenance;

use App\Models\AppNotification;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Profiles\OwnerProfile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC16 (O14), ADR-0037 : au-delà du plafond de travaux du bailleur, l'approbation de
 * l'agence fait attendre le bailleur, et lui seul tranche.
 *
 * Avant : l'agent approuvait n'importe quel montant (`manageQuotes` → `isPrincipalFor`).
 */
class MaintenanceOwnerApprovalThresholdTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_above_threshold_waits_for_the_landlord(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->scenario(75000, threshold: 50000);
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($agent);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'awaiting_owner');

        $this->assertSame(
            [__('notifications.codes.maintenance_quote.awaiting_owner.title', ['request' => $mr->title], 'fr')],
            AppNotification::query()->where('user_id', $landlord->id)->pluck('title')->all(),
        );

        // L'agent ne tranche pas à la place du bailleur ; un autre bailleur de l'agence non plus.
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertForbidden();
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/reject", ['reason' => 'Je préfère refuser'])->assertForbidden();
        Sanctum::actingAs($this->landlordOf($agency));
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertForbidden();

        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        $this->assertSame($landlord->id, $mr->refresh()->quote_decision_by_id);
    }

    public function test_landlord_may_also_reject_while_awaiting(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->scenario(75000, threshold: 50000, status: MaintenanceStatus::AwaitingOwner);

        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/reject", ['reason' => 'Trop cher pour moi'])
            ->assertOk()->assertJsonPath('data.status', 'rejected');
    }

    public function test_below_threshold_is_approved_directly(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->scenario(40000, threshold: 50000);

        Sanctum::actingAs($this->agentOf($agency));
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');
    }

    public function test_null_threshold_keeps_the_previous_behaviour(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->scenario(750000, threshold: null);

        Sanctum::actingAs($this->agentOf($agency));
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');
    }

    /** Le plafond borne ce que l'agence décide POUR le bailleur, pas ce qu'il décide lui-même. */
    public function test_landlord_approving_himself_skips_the_wait(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->scenario(75000, threshold: 50000);

        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');
    }

    /** `awaiting_owner` n'est pas une cible du statut générique. */
    public function test_awaiting_owner_is_not_a_generic_target(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->scenario(75000, threshold: 50000);

        Sanctum::actingAs($landlord);
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'awaiting_owner'])->assertUnprocessable();
    }

    /** @return array<string, mixed> */
    private function scenario(int $amount, ?int $threshold, MaintenanceStatus $status = MaintenanceStatus::QuoteSubmitted): array
    {
        $scenario = $this->maintenanceScenario($status, ['quote_amount' => $amount, 'quote_currency' => 'XOF', 'quote_submitted_at' => now()]);
        OwnerProfile::query()
            ->where('user_id', $scenario['landlord']->id)
            ->where('agency_id', $scenario['agency']->id)
            ->update(['works_approval_threshold' => $threshold]);

        return $scenario;
    }
}
