<?php

namespace Tests\Feature\Http;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\TagType;
use App\Models\KpiConfig;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\Tag;
use App\Models\ThresholdAlert;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-2045 (P61.04, décision du porteur) — cinq réponses rendaient un modèle brut : le `pivot` des
 * étiquettes d'un bien (nom de classe PHP compris), la relation de référent d'un client, le profil
 * d'agent suspendu (`metadata` entier, KYC compris) et les listes de KPI et d'alertes (instants en
 * `.000000Z`, seuils décimaux en chaîne). Chacune passe désormais par une ressource.
 */
class ReponsesSansModeleBrutTest extends ApiTestCase
{
    use RefreshDatabase;

    private const INSTANT_ADR_0018 = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/';

    public function test_les_etiquettes_d_un_bien_sortent_sans_pivot(): void
    {
        $proprietaire = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $proprietaire->id]);
        $piscine = Tag::factory()->create(['name' => 'Piscine', 'type' => TagType::Amenity]);
        Sanctum::actingAs($proprietaire);

        $reponse = $this->postJson("/api/properties/{$bien->id}/tags", ['tag_ids' => [$piscine->id]])->assertOk();

        $this->assertSame(
            ['id', 'name', 'slug', 'type', 'status', 'icon', 'color'],
            array_keys($reponse->json('data.0')),
        );
        $this->assertSame('amenity', $reponse->json('data.0.type'));
    }

    public function test_le_referent_d_un_client_sort_par_sa_projection(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create();
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $customer = Customer::factory()->create(['agency_id' => $agency->id, 'added_by_id' => $agent->id]);

        $reponse = $this->actingAsApi($agent)
            ->apiPost("/api/customers/{$customer->id}/primary-contact", ['user_id' => $agent->id])
            ->assertOk()
            ->assertJsonPath('data.is_primary', true)
            ->assertJsonPath('data.user_id', $agent->id);

        $this->assertMatchesRegularExpression(self::INSTANT_ADR_0018, (string) $reponse->json('data.created_at'));
        $this->assertSame('agent_client', $reponse->json('data.relationship_type'));
    }

    public function test_le_profil_d_agent_suspendu_ne_rend_pas_ses_metadonnees(): void
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->actingAsRole('agency_admin', ['agency_id' => $agency->id]);
        $profile = AgentProfile::factory()->create([
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Active->value,
            'metadata' => ['kyc' => ['id_document_number' => 'SN-123456']],
        ]);

        $reponse = $this->patchJson("/api/profiles/{$profile->id}/suspend")
            ->assertOk()
            ->assertJsonPath('data.status', AgentProfileStatus::Suspended->value)
            ->assertJsonMissingPath('data.metadata');

        $this->assertMatchesRegularExpression(self::INSTANT_ADR_0018, (string) $reponse->json('data.updated_at'));
    }

    public function test_la_liste_des_kpi_rend_ses_instants_selon_l_adr_0018_et_suit_les_fields(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        KpiConfig::query()->create([
            'agency_id' => $agency->id, 'metric' => 'leases_active', 'label' => 'Baux', 'sort_order' => 1,
        ]);

        $reponse = $this->apiGet('/api/kpi-configs')->assertOk();
        $this->assertMatchesRegularExpression(self::INSTANT_ADR_0018, (string) $reponse->json('data.0.created_at'));

        $creuse = $this->apiGet('/api/kpi-configs?fields[kpi_configs]=id,metric')->assertOk();
        $this->assertSame(['id', 'metric'], array_keys($creuse->json('data.0')));
    }

    public function test_la_liste_des_alertes_rend_ses_seuils_en_nombre(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        ThresholdAlert::query()->create([
            'agency_id' => $agency->id, 'metric' => 'overdue_count', 'operator' => '>=',
            'threshold' => 10.5, 'severity' => 'warning', 'last_value' => 3,
        ]);

        $reponse = $this->apiGet('/api/threshold-alerts')->assertOk();

        $this->assertSame(10.5, $reponse->json('data.0.threshold'));
        $this->assertEquals(3, $reponse->json('data.0.last_value'));
        $this->assertIsNotString($reponse->json('data.0.last_value'));
        $this->assertMatchesRegularExpression(self::INSTANT_ADR_0018, (string) $reponse->json('data.0.created_at'));
    }

    /** `include=agency` est accepté par les deux listes : la ressource l'émet, réduit à son identité. */
    public function test_les_listes_de_kpi_et_d_alertes_emettent_l_agence_incluse(): void
    {
        $agency = Agency::factory()->create(['name' => 'Agence Lin']);
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        KpiConfig::query()->create([
            'agency_id' => $agency->id, 'metric' => 'leases_active', 'label' => 'Baux', 'sort_order' => 1,
        ]);
        ThresholdAlert::query()->create([
            'agency_id' => $agency->id, 'metric' => 'overdue_count', 'operator' => '>=',
            'threshold' => 1, 'severity' => 'warning',
        ]);

        foreach (['/api/kpi-configs', '/api/threshold-alerts'] as $chemin) {
            $this->assertArrayNotHasKey('agency', $this->apiGet($chemin)->assertOk()->json('data.0'), $chemin);
            $this->assertSame(
                ['id' => $agency->id, 'name' => 'Agence Lin'],
                $this->apiGet($chemin.'?include=agency')->assertOk()->json('data.0.agency'),
                $chemin,
            );
        }
    }
}
