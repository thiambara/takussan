<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\KpiConfig;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\ThresholdAlert;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-1701 (P82.04) — créer, modifier et supprimer un indicateur (`KpiConfig`) ou une alerte de
 * seuil (`ThresholdAlert`) se juge par `agency.update` sous le profil actif de l'agence, plus par
 * le type de profil.
 *
 * Avant : `isAgencyAdminAt` seul. Un admin dont le rôle personnalisé retire toutes les capacités
 * passait (201), un agent dont le rôle les porte toutes était refusé (403). La lecture (`GET`) reste
 * au personnel de l'agence, inchangée.
 */
class AgencyIndicatorCapabilityTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /**
     * Les six gestes d'écriture, dans l'ordre. Chaque geste vise une ligne qui lui est propre, pour
     * que la suppression ne dépende pas de la modification.
     *
     * @return array<string, int>
     */
    private function sixGestes(Agency $agency): array
    {
        $kpiModifie = $this->kpi($agency, 'overdue_count');
        $kpiSupprime = $this->kpi($agency, 'overdue_amount');
        $alerteModifiee = $this->alerte($agency);
        $alerteSupprimee = $this->alerte($agency);

        return [
            'kpi.store' => $this->postJson('/api/kpi-configs', [
                'metric' => 'unpaid_rate_percent',
                'label' => 'Taux d’impayés',
            ])->status(),
            'kpi.update' => $this->putJson("/api/kpi-configs/{$kpiModifie->id}", ['label' => 'Renommé'])->status(),
            'kpi.destroy' => $this->deleteJson("/api/kpi-configs/{$kpiSupprime->id}")->status(),
            'alerte.store' => $this->postJson('/api/threshold-alerts', [
                'metric' => 'unpaid_rate_percent',
                'operator' => '>',
                'threshold' => 10,
            ])->status(),
            'alerte.update' => $this->putJson("/api/threshold-alerts/{$alerteModifiee->id}", ['threshold' => 20])->status(),
            'alerte.destroy' => $this->deleteJson("/api/threshold-alerts/{$alerteSupprimee->id}")->status(),
        ];
    }

    private function kpi(Agency $agency, string $metric): KpiConfig
    {
        return KpiConfig::create(['agency_id' => $agency->id, 'metric' => $metric, 'label' => $metric]);
    }

    private function alerte(Agency $agency): ThresholdAlert
    {
        return ThresholdAlert::create([
            'agency_id' => $agency->id,
            'metric' => 'occupancy_rate_percent',
            'operator' => '<',
            'threshold' => 50,
            'severity' => 'warning',
            'is_enabled' => true,
        ]);
    }

    private const ACCEPTES = [
        'kpi.store' => 201,
        'kpi.update' => 200,
        'kpi.destroy' => 200,
        'alerte.store' => 201,
        'alerte.update' => 200,
        'alerte.destroy' => 200,
    ];

    public function test_un_admin_dont_le_role_retire_agency_update_est_refuse_sur_les_six_gestes(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->adminWithout($agency, Capability::AgencyUpdate);
        $this->actingAsApi($admin);

        $this->assertSame(array_fill_keys(array_keys(self::ACCEPTES), 403), $this->sixGestes($agency));

        // Rien n'a été écrit : quatre lignes posées par le test, aucune créée, aucune supprimée.
        $this->assertSame(2, KpiConfig::query()->count());
        $this->assertSame(2, ThresholdAlert::query()->count());
        $this->assertDatabaseMissing('kpi_configs', ['label' => 'Renommé']);

        // La lecture ne change pas : elle reste au personnel de l'agence.
        $this->getJson('/api/kpi-configs')->assertOk();
        $this->getJson('/api/threshold-alerts')->assertOk();
    }

    public function test_un_agent_dont_le_role_porte_agency_update_est_accepte_sur_les_six_gestes(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsApi($this->agentWith($agency, Capability::AgencyUpdate));

        $this->assertSame(self::ACCEPTES, $this->sixGestes($agency));
        $this->assertDatabaseHas('kpi_configs', ['agency_id' => $agency->id, 'metric' => 'unpaid_rate_percent']);
        $this->assertDatabaseHas('kpi_configs', ['label' => 'Renommé']);
    }

    public function test_l_admin_systeme_garde_les_six_gestes(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsApi($this->agencyAdmin($agency));

        $this->assertSame(self::ACCEPTES, $this->sixGestes($agency));
    }

    public function test_l_agent_systeme_reste_refuse(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsApi($this->agencyAgent($agency));

        $this->assertSame(array_fill_keys(array_keys(self::ACCEPTES), 403), $this->sixGestes($agency));
    }

    public function test_un_agent_qui_tient_agency_update_ne_touche_pas_une_autre_agence(): void
    {
        $agency = Agency::factory()->create();
        $autre = Agency::factory()->create();
        $this->actingAsApi($this->agentWith($agency, Capability::AgencyUpdate));

        $kpi = $this->kpi($autre, 'overdue_count');
        $alerte = $this->alerte($autre);

        $this->putJson("/api/kpi-configs/{$kpi->id}", ['label' => 'Renommé'])->assertForbidden();
        $this->deleteJson("/api/kpi-configs/{$kpi->id}")->assertForbidden();
        $this->putJson("/api/threshold-alerts/{$alerte->id}", ['threshold' => 20])->assertForbidden();
        $this->deleteJson("/api/threshold-alerts/{$alerte->id}")->assertForbidden();
        $this->postJson('/api/kpi-configs', [
            'agency_id' => $autre->id,
            'metric' => 'unpaid_rate_percent',
            'label' => 'x',
        ])->assertForbidden();
    }

    /**
     * La clause de profil actif (contrat TCK-146, comme `AgencyPolicy::updateKyc`) : admin de A et
     * agent de B, sous son profil d'agent de B, il ne modifie pas les indicateurs de A. `canActAt`
     * seul le laisserait passer.
     */
    public function test_un_admin_de_a_sous_son_profil_d_agent_de_b_est_refuse_sur_a(): void
    {
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $user = $this->agencyAdmin($a);
        $adminProfile = AgencyAdminProfile::query()->where('user_id', $user->id)->firstOrFail();
        $agentProfile = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);
        $this->actingAsApi($user);

        $kpi = $this->kpi($a, 'overdue_count');
        $sousB = ['X-Profile-Id' => "agent:{$agentProfile->id}"];
        $sousA = ['X-Profile-Id' => "agency_admin:{$adminProfile->id}"];

        $this->withHeaders($sousB)->putJson("/api/kpi-configs/{$kpi->id}", ['label' => 'Renommé'])->assertForbidden();
        $this->withHeaders($sousB)->deleteJson("/api/kpi-configs/{$kpi->id}")->assertForbidden();
        $this->withHeaders($sousA)->putJson("/api/kpi-configs/{$kpi->id}", ['label' => 'Renommé'])->assertOk();
    }

    public function test_le_super_admin_reste_accepte(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('super_admin');

        $kpi = $this->kpi($agency, 'overdue_count');
        $this->putJson("/api/kpi-configs/{$kpi->id}", ['label' => 'Renommé'])->assertOk();
        $this->deleteJson("/api/kpi-configs/{$kpi->id}")->assertOk();
    }
}
