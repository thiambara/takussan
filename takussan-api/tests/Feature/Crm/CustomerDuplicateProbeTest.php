<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2588 — la sonde de doublon pendant la saisie : les fiches de l'agence ACTIVE au même
 * téléphone normalisé ou au même e-mail replié, `{id, name, stage}`, cinq au plus, rien d'autre.
 * Réservée à qui peut créer une fiche (403 au bailleur) ; limitée en débit.
 */
class CustomerDuplicateProbeTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private Customer $mariama;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
        $this->mariama = $this->ficheClient($this->agence, null, [
            'first_name' => 'Mariama', 'last_name' => 'Fall', 'phone' => '+221706482056',
            'email' => 'Mariama.Fall@example.com', 'pipeline_stage' => CustomerPipelineStage::Qualified,
            'id_number' => '1234567890123', 'occupation' => 'Juriste',
        ]);
    }

    /** AC5 — l'agent de son agence la trouve, sous les deux écritures du « + » dans l'URL. */
    public function test_ac5_l_agent_de_l_agence_trouve_mariama(): void
    {
        Sanctum::actingAs($this->agent);

        $attendu = [['id' => $this->mariama->id, 'name' => 'Mariama Fall', 'stage' => 'qualified']];
        // Écrit tel quel, le « + » arrive décodé en espace.
        $this->assertSame($attendu, $this->getJson('/api/customers/duplicates?phone=+221706482056')->assertOk()->json('data'));
        $this->assertSame($attendu, $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk()->json('data'));
        $this->assertSame($attendu, $this->getJson('/api/customers/duplicates?phone=70%20648%2020%2056')->assertOk()->json('data'));
        $this->assertSame($attendu, $this->getJson('/api/customers/duplicates?email=mariama.fall@EXAMPLE.com')->assertOk()->json('data'));

        $this->assertSame([], $this->getJson('/api/customers/duplicates?phone=%2B221700000000')->assertOk()->json('data'));
    }

    /** Rien d'autre que l'identifiant, le nom et l'étape : ni pièce, ni téléphone, ni profession. */
    public function test_la_sonde_ne_rend_que_trois_champs(): void
    {
        Sanctum::actingAs($this->agent);
        $corps = $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk();

        $this->assertSame(['id', 'name', 'stage'], array_keys($corps->json('data.0')));
        foreach (['1234567890123', 'Juriste', '706482056', 'example.com'] as $secret) {
            $this->assertStringNotContainsString($secret, $corps->getContent());
        }
    }

    /** AC5 — un agent d'une autre agence : liste vide ; un bailleur : 403, avant la validation. */
    public function test_ac5_autre_agence_vide_et_bailleur_403(): void
    {
        Sanctum::actingAs($this->personnel($this->agence()));
        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertOk()->assertExactJson(['data' => []]);

        Sanctum::actingAs($this->bailleur($this->agence));
        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertForbidden();
        $this->getJson('/api/customers/duplicates')->assertForbidden();

        Sanctum::actingAs($this->client());
        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')->assertForbidden();
    }

    /** Sans `crm.view_all`, le doublon d'un collègue se signale sans nom, sans identifiant, sans étape. */
    public function test_sans_vue_globale_le_doublon_se_signale_sans_rien_livrer(): void
    {
        $role = AgencyRole::factory()->for($this->agence)->withCapabilities([Capability::PropertiesCreate])->create();
        Sanctum::actingAs($this->personnel($this->agence, agencyRole: $role));

        $this->getJson('/api/customers/duplicates?phone=%2B221706482056')
            ->assertOk()
            ->assertExactJson(['data' => [['id' => null, 'name' => null, 'stage' => null]]]);
    }

    public function test_un_critere_est_requis(): void
    {
        Sanctum::actingAs($this->agent);
        $this->getJson('/api/customers/duplicates')->assertStatus(422);
    }

    public function test_la_sonde_est_limitee_a_20_par_minute(): void
    {
        Sanctum::actingAs($this->agent);
        for ($i = 0; $i < 20; $i++) {
            $this->getJson('/api/customers/duplicates?email=x'.$i.'@example.com')->assertOk();
        }
        $this->getJson('/api/customers/duplicates?email=y@example.com')->assertStatus(429);
    }
}
