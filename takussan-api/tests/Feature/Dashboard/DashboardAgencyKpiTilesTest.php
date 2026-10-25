<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\KpiConfig;
use App\Models\Lease;
use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-2373 (P249.02) — `GET /api/dashboard/agency` sert, sous `data.kpis`, les indicateurs que
 * l'agence a configurés dans l'écran « Indicateurs » (`kpi_configs`) : les seuls activés, dans
 * l'ordre de `sort_order`, avec leur libellé, leur format et la valeur calculée par l'API.
 * Sans configuration, la liste est vide et le tableau de bord garde ses six tuiles par défaut.
 */
class DashboardAgencyKpiTilesTest extends ApiTestCase
{
    use RefreshDatabase;

    private function agencyWithAdmin(): Agency
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        return $agency;
    }

    public function test_sans_configuration_la_liste_est_vide(): void
    {
        $this->agencyWithAdmin();

        $response = $this->apiGet('/api/dashboard/agency')->assertOk();

        $this->assertSame([], $response->json('data.kpis'));
    }

    public function test_les_indicateurs_actives_sont_servis_dans_l_ordre_avec_libelle_format_et_valeur(): void
    {
        $agency = $this->agencyWithAdmin();
        Property::factory()->count(3)->create(['agency_id' => $agency->id]);
        Lease::factory()->active()->create(['agency_id' => $agency->id]);

        KpiConfig::create([
            'agency_id' => $agency->id, 'metric' => 'occupancy_rate_percent',
            'label' => 'Taux', 'format' => 'percent', 'sort_order' => 2,
        ]);
        KpiConfig::create([
            'agency_id' => $agency->id, 'metric' => 'properties_total',
            'label' => 'Parc', 'format' => 'number', 'sort_order' => 1,
        ]);
        KpiConfig::create([
            'agency_id' => $agency->id, 'metric' => 'revenue_month',
            'label' => 'Encaissé', 'format' => 'currency', 'sort_order' => 3,
        ]);
        // Désactivé : absent des tuiles.
        KpiConfig::create([
            'agency_id' => $agency->id, 'metric' => 'leases_active',
            'label' => 'Baux', 'sort_order' => 0, 'is_enabled' => false,
        ]);
        // Une autre agence : jamais lue.
        $other = Agency::factory()->create();
        KpiConfig::create(['agency_id' => $other->id, 'metric' => 'members_count', 'label' => 'Équipe']);

        $response = $this->apiGet('/api/dashboard/agency')->assertOk();

        $this->assertSame(
            ['properties_total', 'occupancy_rate_percent', 'revenue_month'],
            array_column($response->json('data.kpis'), 'metric'),
        );
        $this->assertSame([
            'metric' => 'properties_total', 'label' => 'Parc', 'format' => 'number', 'value' => 3,
        ], $response->json('data.kpis.0'));
        $this->assertSame('Taux', $response->json('data.kpis.1.label'));
        $this->assertSame('percent', $response->json('data.kpis.1.format'));
        // La valeur est celle que l'API sert déjà ailleurs dans le résumé, jamais recalculée à part.
        $this->assertSame($response->json('data.occupancy.rate_percent'), $response->json('data.kpis.1.value'));
        $this->assertSame('currency', $response->json('data.kpis.2.format'));
        $this->assertEquals($response->json('data.finance.revenue_month'), $response->json('data.kpis.2.value'));
    }

    public function test_une_valeur_sans_denominateur_reste_nulle(): void
    {
        $agency = $this->agencyWithAdmin();
        KpiConfig::create([
            'agency_id' => $agency->id, 'metric' => 'occupancy_rate_percent',
            'label' => 'Taux', 'format' => 'percent',
        ]);

        $response = $this->apiGet('/api/dashboard/agency')->assertOk();

        $this->assertCount(1, $response->json('data.kpis'));
        $this->assertArrayHasKey('value', $response->json('data.kpis.0'));
        $this->assertNull($response->json('data.kpis.0.value'));
    }
}
