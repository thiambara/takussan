<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\KpiConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-1102 (P92.03) — un indicateur au plus une fois par agence (`unique(agency_id, metric)`,
 * models-spec § 64) : le doublon se refuse en 422 sur `metric`, au lieu du 500 de la contrainte.
 */
class KpiConfigDuplicateTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_creer_une_metrique_deja_configuree_pour_l_agence_rend_422(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiPost('/api/kpi-configs', ['metric' => 'unpaid_rate_percent', 'label' => 'Impayés'])
            ->assertStatus(201);

        $this->apiPost('/api/kpi-configs', ['metric' => 'unpaid_rate_percent', 'label' => 'Encore'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['metric']);

        $this->assertSame(1, KpiConfig::query()->where('agency_id', $agency->id)->count());
    }

    public function test_le_super_admin_est_juge_sur_l_agence_qu_il_designe(): void
    {
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();
        KpiConfig::create(['agency_id' => $agency->id, 'metric' => 'unpaid_rate_percent', 'label' => 'Impayés']);
        $this->apiActingAsRole('super_admin');

        $this->apiPost('/api/kpi-configs', [
            'agency_id' => $agency->id, 'metric' => 'unpaid_rate_percent', 'label' => 'Doublon',
        ])->assertStatus(422)->assertJsonValidationErrors(['metric']);

        // Témoin : la même métrique dans une autre agence reste permise.
        $this->apiPost('/api/kpi-configs', [
            'agency_id' => $other->id, 'metric' => 'unpaid_rate_percent', 'label' => 'Autre agence',
        ])->assertStatus(201);
    }

    public function test_modifier_vers_une_metrique_deja_configuree_rend_422(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        KpiConfig::create(['agency_id' => $agency->id, 'metric' => 'unpaid_rate_percent', 'label' => 'Impayés']);
        $second = KpiConfig::create(['agency_id' => $agency->id, 'metric' => 'occupancy_rate_percent', 'label' => 'Occupation']);

        $this->apiPut("/api/kpi-configs/{$second->id}", ['metric' => 'unpaid_rate_percent'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['metric']);

        // Témoin : garder sa propre métrique n'est pas un doublon.
        $this->apiPut("/api/kpi-configs/{$second->id}", ['metric' => 'occupancy_rate_percent', 'label' => 'Taux'])
            ->assertOk();
    }
}
