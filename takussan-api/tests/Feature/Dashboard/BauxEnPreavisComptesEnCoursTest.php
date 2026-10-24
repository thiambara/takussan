<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Services\Reporting\PlatformMetricsSnapshotter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * P162.02 (TCK-1714) — un bail en préavis (`terminating`) reste un bail en cours : son loyer est dû
 * jusqu'à la date d'effet (`LeaseStatus`). Le bailleur, l'agence, les statistiques d'agence, le
 * compteur `agencies.active_leases_count` et l'instantané plateforme ne comptaient que `active`.
 * Ils lisent désormais `Lease::ONGOING_STATUSES`, comme le locataire (TCK-1001).
 */
class BauxEnPreavisComptesEnCoursTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_le_bailleur_compte_le_bail_en_preavis_et_son_loyer(): void
    {
        $owner = $this->apiActingAsRole('owner');
        Lease::factory()->create(['landlord_id' => $owner->id, 'status' => LeaseStatus::Active, 'monthly_rent' => 50_000]);
        Lease::factory()->create(['landlord_id' => $owner->id, 'status' => LeaseStatus::Terminating, 'monthly_rent' => 100_000]);
        // Témoin : un bail terminé ne compte pas.
        Lease::factory()->create(['landlord_id' => $owner->id, 'status' => LeaseStatus::Terminated, 'monthly_rent' => 70_000]);

        $response = $this->apiGet('/api/dashboard/owner')->assertOk();

        $this->assertSame(2, $response->json('data.leases.active'));
        $this->assertEquals(150_000, $response->json('data.finance.expected_monthly'));
    }

    public function test_l_agence_et_ses_statistiques_comptent_le_bail_en_preavis(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);
        Lease::factory()->create(['agency_id' => $agency->id, 'status' => LeaseStatus::Active]);
        Lease::factory()->create(['agency_id' => $agency->id, 'status' => LeaseStatus::Terminating]);
        Lease::factory()->create(['agency_id' => $agency->id, 'status' => LeaseStatus::Terminated]);

        $this->assertSame(2, $this->apiGet('/api/dashboard/agency')->assertOk()->json('data.leases.active'));
        $this->assertSame(2, $this->apiGet("/api/agencies/{$agency->id}/stats")->assertOk()->json('data.active_leases_count'));
    }

    public function test_le_compteur_d_agence_garde_le_bail_passe_en_preavis(): void
    {
        $agency = Agency::factory()->create(['active_leases_count' => 0]);
        $lease = Lease::factory()->create(['agency_id' => $agency->id, 'status' => LeaseStatus::Active]);
        $lease->update(['status' => LeaseStatus::Terminating]);

        $this->assertSame(1, (int) $agency->fresh()->active_leases_count);

        $lease->update(['status' => LeaseStatus::Terminated]);

        $this->assertSame(0, (int) $agency->fresh()->active_leases_count);
    }

    public function test_l_instantane_plateforme_compte_le_bail_en_preavis(): void
    {
        Lease::factory()->create(['status' => LeaseStatus::Active]);
        Lease::factory()->create(['status' => LeaseStatus::Terminating]);
        Lease::factory()->create(['status' => LeaseStatus::Terminated]);

        $this->assertSame(2, app(PlatformMetricsSnapshotter::class)->stocks(now())['leases_active']);
    }
}
