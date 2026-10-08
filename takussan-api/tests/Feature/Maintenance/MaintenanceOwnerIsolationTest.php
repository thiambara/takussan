<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC5 (O1, partie maintenance) : un bailleur ne voit pas les interventions des autres
 * bailleurs de son agence.
 *
 * `view`, `update` et `isPrincipalFor` accordaient sur `$user->agency_id === $property->agency_id`
 * sans regarder le type de profil ; un bailleur invité porte un `OwnerProfile` de l'agence. Le
 * témoin est un agent de la même agence, qui garde chacun de ces gestes.
 */
class MaintenanceOwnerIsolationTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_another_landlord_of_the_agency_is_kept_out(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'property' => $property] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 10000]);
        $b2 = $this->landlordOf($agency);

        Sanctum::actingAs($b2);

        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertForbidden();
        $this->assertNotContains($mr->id, collect($this->getJson('/api/maintenance-requests')->assertOk()->json('data'))->pluck('id')->all());
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['priority' => 'urgent'])->assertForbidden();
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertForbidden();
        $this->postJson('/api/maintenance-requests', [
            'property_id' => $property->id,
            'title' => 'Fenêtre cassée',
            'description' => 'Vitre fendue',
            'category' => 'plumbing',
        ])->assertForbidden();

        $this->assertSame(MaintenanceStatus::QuoteSubmitted, $mr->refresh()->status);
    }

    public function test_agent_of_the_agency_keeps_access(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::QuoteSubmitted, ['quote_amount' => 10000]);
        $agent = $this->agentOf($agency);

        Sanctum::actingAs($agent);

        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();
        $this->assertContains($mr->id, collect($this->getJson('/api/maintenance-requests')->assertOk()->json('data'))->pluck('id')->all());
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['priority' => 'urgent'])->assertOk();
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk();
    }
}
