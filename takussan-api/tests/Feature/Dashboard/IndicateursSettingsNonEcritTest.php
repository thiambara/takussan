<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\KpiConfig;
use App\Models\ThresholdAlert;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-1811 (P181.06) — `settings` des indicateurs et des alertes de seuil n'a
 * ni lecteur côté API ni émetteur côté front. Les quatre requêtes l'acceptaient
 * sans borne (`sometimes|array`) et l'écrivaient tel quel : il n'est plus une
 * entrée, et ce qu'un client envoie sous cette clé n'est pas écrit.
 */
class IndicateursSettingsNonEcritTest extends ApiTestCase
{
    use RefreshDatabase;

    private const SETTINGS = ['junk' => ['a', 'b', 'c'], 'goal' => 10];

    public function test_la_creation_d_un_indicateur_n_ecrit_pas_settings(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $id = $this->apiPost('/api/kpi-configs', [
            'metric' => 'unpaid_rate_percent',
            'label' => 'Impayés',
            'settings' => self::SETTINGS,
        ])->assertStatus(201)->json('data.id');

        $this->assertNull(KpiConfig::findOrFail($id)->settings);
    }

    public function test_la_modification_d_un_indicateur_n_ecrit_pas_settings(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $kpi = KpiConfig::create(['agency_id' => $agency->id, 'metric' => 'unpaid_rate_percent', 'label' => 'Impayés']);

        $this->apiPut("/api/kpi-configs/{$kpi->id}", ['label' => 'Taux', 'settings' => self::SETTINGS])
            ->assertOk();

        $kpi->refresh();
        $this->assertSame('Taux', $kpi->label);
        $this->assertNull($kpi->settings);
    }

    public function test_la_creation_d_une_alerte_n_ecrit_pas_settings(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $id = $this->apiPost('/api/threshold-alerts', [
            'metric' => 'unpaid_rate_percent',
            'operator' => '>',
            'threshold' => 15,
            'settings' => self::SETTINGS,
        ])->assertStatus(201)->json('data.id');

        $this->assertNull(ThresholdAlert::findOrFail($id)->settings);
    }

    public function test_la_modification_d_une_alerte_n_ecrit_pas_settings(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $alert = ThresholdAlert::create([
            'agency_id' => $agency->id,
            'metric' => 'unpaid_rate_percent',
            'operator' => '>',
            'threshold' => 5,
        ]);

        $this->apiPut("/api/threshold-alerts/{$alert->id}", ['threshold' => 20, 'settings' => self::SETTINGS])
            ->assertOk();

        $alert->refresh();
        $this->assertEquals(20, $alert->threshold);
        $this->assertNull($alert->settings);
    }
}
