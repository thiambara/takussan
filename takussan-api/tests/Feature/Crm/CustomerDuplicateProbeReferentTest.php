<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2889 — la sonde de doublon nomme le référent de la fiche trouvée (`{id, name}`, ou `null`),
 * au seul lecteur qui en voit déjà l'étape ; jamais une coordonnée du référent.
 */
class CustomerDuplicateProbeReferentTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $referente;

    private Customer $mariama;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->referente = $this->personnel($this->agence, attributes: [
            'first_name' => 'Khady', 'last_name' => 'Sow', 'email' => 'khady.sow@agence.example',
        ]);
        $this->mariama = $this->ficheClient($this->agence, null, [
            'first_name' => 'Mariama', 'last_name' => 'Fall', 'phone' => '+221706482056',
            'pipeline_stage' => CustomerPipelineStage::Negotiating,
        ]);
        UserCustomerRelationship::query()->create([
            'user_id' => $this->referente->id, 'customer_id' => $this->mariama->id,
            'relationship_type' => 'agent_client', 'status' => 'active', 'is_primary' => true,
        ]);
    }

    /** AC3 — sur un téléphone connu : l'étape et le nom du référent ; aucune coordonnée du référent. */
    public function test_ac3_la_sonde_rend_l_etape_et_le_referent(): void
    {
        Sanctum::actingAs($this->agent);
        $corps = $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk();

        $this->assertSame([[
            'id' => $this->mariama->id, 'name' => 'Mariama Fall', 'stage' => 'negotiating',
            'referent' => ['id' => $this->referente->id, 'name' => 'Khady Sow'],
        ]], $corps->json('data'));
        $this->assertStringNotContainsString('khady.sow@agence.example', $corps->getContent());
        $this->assertStringNotContainsString((string) $this->referente->phone, $corps->getContent());
    }

    /** Une fiche sans référent : `referent` à `null`. */
    public function test_sans_referent_null(): void
    {
        UserCustomerRelationship::query()->delete();
        Sanctum::actingAs($this->agent);

        $this->assertNull($this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk()->json('data.0.referent'));
        $this->assertSame('negotiating', $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->json('data.0.stage'));
    }

    /** Le lecteur à qui l'étape est masquée ne reçoit pas davantage le référent. */
    public function test_masque_comme_l_etape(): void
    {
        $role = AgencyRole::factory()->for($this->agence)->withCapabilities([Capability::PropertiesCreate])->create();
        Sanctum::actingAs($this->personnel($this->agence, agencyRole: $role));

        $corps = $this->getJson('/api/customers/duplicates?phone=%2B221706482056')
            ->assertOk()
            ->assertExactJson(['data' => [['id' => null, 'name' => null, 'stage' => null, 'referent' => null]]]);
        $this->assertStringNotContainsString('Khady', $corps->getContent());
    }
}
