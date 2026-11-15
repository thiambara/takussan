<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2652 (AC4, décision famille 4 n° 6a, amendement de §1.8) — l'estimation et le coût réel ne sont
 * pas servis au demandeur locataire, ni en liste ni en fiche ; le donneur d'ordre (admin de l'agence),
 * le bailleur du bien et le prestataire assigné les reçoivent.
 */
class MaintenanceCostHiddenFromTenantTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** @return list<array<string, mixed>> la ligne de la liste, puis la fiche */
    private function rowsFor(User $user, int $id): array
    {
        Sanctum::actingAs($user);

        return [
            $this->getJson('/api/maintenance-requests')->assertOk()->json('data.0'),
            $this->getJson("/api/maintenance-requests/{$id}")->assertOk()->json('data'),
        ];
    }

    /** AC4 — comme la #44 de la démo. */
    public function test_ac4_the_tenant_requester_reads_no_cost_and_the_principals_do(): void
    {
        ['mr' => $mr, 'tenant' => $tenant, 'landlord' => $landlord, 'provider' => $provider, 'agency' => $agency]
            = $this->maintenanceScenario(MaintenanceStatus::Completed, [
                'completed_at' => now(), 'estimated_cost' => 190753, 'actual_cost' => 124198,
            ]);
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);

        foreach ($this->rowsFor($tenant, $mr->id) as $row) {
            $this->assertSame($mr->id, $row['id']);
            $this->assertArrayNotHasKey('estimated_cost', $row);
            $this->assertArrayNotHasKey('actual_cost', $row);
            $this->assertArrayNotHasKey('quote_amount', $row);
        }

        foreach (['admin' => $admin, 'landlord' => $landlord, 'provider' => $provider] as $who => $user) {
            foreach ($this->rowsFor($user, $mr->id) as $row) {
                $this->assertSame(190753.0, (float) $row['estimated_cost'], $who);
                $this->assertSame(124198.0, (float) $row['actual_cost'], $who);
            }
        }
    }
}
