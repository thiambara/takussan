<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
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
}
