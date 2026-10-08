<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\AgencyKind;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 (verif-592, mineur 8, sonde v19) — réassigner remet le devis à zéro. B démarrait sur le
 * devis de A, approuvé à 30 000, sans en avoir soumis aucun.
 */
class MaintenanceReassignmentQuoteResetTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_reassignment_after_approval_archives_the_quote_and_asks_for_a_new_one(): void
    {
        ['mr' => $mr, 'provider' => $a, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);

        Sanctum::actingAs($a);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(30000))->assertOk();
        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk();

        $b = $this->providerFor($agency);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $b->id])->assertOk();

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::QuoteRequested, $mr->status);
        $this->assertNull($mr->quote_amount);
        $this->assertNull($mr->quote_lines);
        $this->assertNull($mr->quote_submitted_at);
        $this->assertNull($mr->quote_decision_at);
        $this->assertCount(1, $mr->metadata['previous_quotes']);
        $this->assertSame($a->id, $mr->metadata['previous_quotes'][0]['provider_id']);
        $this->assertSame('30000.00', $mr->metadata['previous_quotes'][0]['amount']);
        $this->assertNotNull($mr->metadata['previous_quotes'][0]['approved_at']);

        // B ne démarre pas sur le devis de A : il soumet le sien.
        Sanctum::actingAs($b);
        $this->postJson("/api/maintenance-requests/{$mr->id}/start")->assertStatus(422);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(35000))->assertOk();
        $this->assertSame('35000.00', (string) $mr->refresh()->quote_amount);
    }

    public function test_a_submitted_quote_is_archived_without_approval(): void
    {
        ['mr' => $mr, 'provider' => $a, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);

        Sanctum::actingAs($a);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(30000))->assertOk();

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $this->providerFor($agency)->id])->assertOk();

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::QuoteRequested, $mr->status);
        $this->assertNull($mr->quote_amount);
        $this->assertNull($mr->metadata['previous_quotes'][0]['approved_at']);
    }

    public function test_a_reassignment_without_quote_keeps_the_status(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Open);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $this->providerFor($agency)->id])->assertOk();

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::Open, $mr->status);
        $this->assertArrayNotHasKey('previous_quotes', $mr->metadata ?? []);
    }

    /**
     * Passe 2 (N4, sonde p06) — la fin de collaboration ne remettait pas le devis à zéro : B
     * démarrait sans devis, et l'accord donné par le bailleur au devis de A (200 000, plafond
     * 50 000) couvrait le coût réel inscrit par l'agence.
     */
    public function test_collaboration_end_archives_the_quote_and_drops_the_owner_agreement(): void
    {
        ['mr' => $mr, 'provider' => $a, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);
        $agency->forceFill(['kind' => AgencyKind::Standard])->save();
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)->update(['works_approval_threshold' => 50000]);

        Sanctum::actingAs($a);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(200000))->assertOk();
        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');

        $sp = ServiceProviderProfile::query()->where('user_id', $a->id)->firstOrFail();
        Sanctum::actingAs($admin);
        $this->patchJson("/api/agencies/{$agency->id}/service-providers/{$sp->id}/collaboration", ['status' => 'ended'])->assertOk();

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::Open, $mr->status);
        $this->assertNull($mr->assigned_to);
        $this->assertNull($mr->quote_amount);
        $this->assertNull($mr->quote_decision_by_id);
        $this->assertSame($a->id, $mr->metadata['previous_quotes'][0]['provider_id']);
        $this->assertSame('200000.00', $mr->metadata['previous_quotes'][0]['amount']);

        $b = $this->providerFor($agency);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $b->id])->assertOk();
        Sanctum::actingAs($b);
        $this->putJson("/api/maintenance-requests/{$mr->id}/status", ['status' => 'in_progress'])->assertOk();

        // L'accord du bailleur ne passe pas d'un prestataire à l'autre : l'agence n'inscrit pas
        // 200 000 au-delà du plafond, le bailleur le peut.
        Sanctum::actingAs($admin);
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['actual_cost' => 200000])
            ->assertUnprocessable()->assertJsonPath('code', 'maintenance.actual_cost_needs_owner');
        $this->assertNull($mr->refresh()->actual_cost);
    }

    /**
     * Passe 2 (N4) — le refus archive de même un devis resté sur la demande. Latent : soumettre un
     * devis vaut acceptation, et un prestataire qui a accepté ne refuse plus ; l'état est posé en
     * base pour éprouver le chemin, que la session a voulu aligner « par cohérence ».
     */
    public function test_decline_archives_the_quote_of_the_provider_who_declines(): void
    {
        ['mr' => $mr, 'provider' => $a] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested, ['accepted_at' => null]);

        Sanctum::actingAs($a);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(30000))->assertOk();
        $mr->refresh()->forceFill(['accepted_at' => null])->save();
        $this->postJson("/api/maintenance-requests/{$mr->id}/decline", ['reason' => 'Finalement pas disponible'])->assertOk();

        $mr->refresh();
        $this->assertSame(MaintenanceStatus::Open, $mr->status);
        $this->assertNull($mr->quote_amount);
        $this->assertNull($mr->quote_submitted_at);
        $this->assertSame($a->id, $mr->metadata['previous_quotes'][0]['provider_id']);
    }

    /**
     * Passe 3 (N9, sonde q07) — le coût réel suit le devis : inscrit par l'agent sous l'accord du
     * bailleur au devis de A (200 000, plafond 50 000), il survivait à la réassignation et devenait
     * le coût des travaux de B, dont l'agent seul avait approuvé 30 000.
     */
    public function test_the_actual_cost_is_archived_and_cleared_with_the_quote(): void
    {
        ['mr' => $mr, 'provider' => $a, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::QuoteRequested);
        OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)->update(['works_approval_threshold' => 50000]);
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($a);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(200000))->assertOk();
        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk();
        Sanctum::actingAs($agent);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 200000])->assertOk();

        $b = $this->providerFor($agency);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $b->id])->assertOk();

        $mr->refresh();
        $this->assertNull($mr->actual_cost);
        $this->assertSame('200000.00', $mr->metadata['previous_quotes'][0]['actual_cost']);

        Sanctum::actingAs($b);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(30000))->assertOk();
        Sanctum::actingAs($agent);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        Sanctum::actingAs($b);
        $this->postJson("/api/maintenance-requests/{$mr->id}/start")->assertOk();
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['resolution_notes' => 'fait'])->assertOk();

        $this->assertNull($mr->refresh()->actual_cost);
    }

    /**
     * Passe 4 (N11, sonde r01) — la trace de l'accord du bailleur (`owner_agreed_actual_cost`)
     * n'était effacée qu'après le retour anticipé de la remise à zéro : le coût retiré, l'accord
     * donné pour A couvrait B, par la réassignation comme par la fin de collaboration.
     */
    public function test_the_owner_cost_agreement_does_not_cross_to_the_next_provider(): void
    {
        foreach (['reassign', 'collaboration_end'] as $path) {
            ['mr' => $mr, 'provider' => $a, 'agency' => $agency, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now(), 'actual_cost' => null]);
            $agency->forceFill(['kind' => AgencyKind::Standard])->save();
            $admin = User::factory()->create();
            AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
            OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)->update(['works_approval_threshold' => 50000]);
            $agent = $this->agentOf($agency);

            Sanctum::actingAs($landlord);
            $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 200000])->assertOk();
            // Le coût retiré en base, la trace restée : l'état que laissait un `PATCH {actual_cost: null}`.
            $mr->refresh()->forceFill(['actual_cost' => null])->save();

            $b = $this->providerFor($agency);
            if ($path === 'reassign') {
                Sanctum::actingAs($agent);
                $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $b->id])->assertOk();
            } else {
                $sp = ServiceProviderProfile::query()->where('user_id', $a->id)->firstOrFail();
                Sanctum::actingAs($admin);
                $this->patchJson("/api/agencies/{$agency->id}/service-providers/{$sp->id}/collaboration", ['status' => 'ended'])->assertOk();
                Sanctum::actingAs($agent);
                $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $b->id])->assertOk();
            }
            $this->assertArrayNotHasKey('owner_agreed_actual_cost', $mr->refresh()->metadata ?? [], $path);

            $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 200000])
                ->assertUnprocessable()->assertJsonPath('code', 'maintenance.actual_cost_needs_owner');
            $this->assertNull($mr->refresh()->actual_cost, $path);
        }
    }
}
