<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\User;
use App\Services\Crm\CustomerDuplicateDetector;
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

    /**
     * TCK-2590 (AC3) — « 70 648 20 » montre déjà Mariama : un numéro sénégalais entamé de sept
     * chiffres se compare par préfixe, sous toutes ses écritures.
     */
    public function test_tck2590_sept_chiffres_trouvent_mariama_par_prefixe(): void
    {
        Sanctum::actingAs($this->agent);

        $attendu = [['id' => $this->mariama->id, 'name' => 'Mariama Fall', 'stage' => 'qualified']];
        foreach (['70%20648%2020', '%2B2217064820', '+2217064820', '002217064820', '70648205'] as $saisie) {
            $this->assertSame($attendu, $this->getJson('/api/customers/duplicates?phone='.$saisie)->assertOk()->json('data'), $saisie);
        }
        // Un préfixe qui n'est pas le sien ne la rend pas.
        $this->assertSame([], $this->getJson('/api/customers/duplicates?phone=70%20648%2021')->assertOk()->json('data'));
    }

    /** TCK-2590 — six chiffres ne sondent rien, même quand ils sont le début d'une fiche. */
    public function test_tck2590_six_chiffres_ne_sondent_rien(): void
    {
        Sanctum::actingAs($this->agent);

        $this->getJson('/api/customers/duplicates?phone=70%20648%202')->assertOk()->assertExactJson(['data' => []]);
        $this->getJson('/api/customers/duplicates?phone=%2B221706482')->assertOk()->assertExactJson(['data' => []]);
    }

    /** TCK-2590 — le préfixe ne sort pas de l'agence active : la fiche d'une autre agence au même début n'est pas rendue. */
    public function test_tck2590_le_prefixe_reste_dans_l_agence(): void
    {
        $autre = $this->agence();
        $this->ficheClient($autre, null, ['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => '+221706482099']);

        Sanctum::actingAs($this->agent);
        $this->assertSame(
            [$this->mariama->id],
            array_column($this->getJson('/api/customers/duplicates?phone=7064820')->assertOk()->json('data'), 'id'),
        );

        Sanctum::actingAs($this->personnel($autre));
        $this->assertSame(['Awa Ndiaye'], array_column($this->getJson('/api/customers/duplicates?phone=7064820')->assertOk()->json('data'), 'name'));
    }

    /** TCK-2590 — cinq fiches au plus sous un préfixe partagé, et masquées à qui ne les lit pas. */
    public function test_tck2590_cinq_au_plus_et_masquees(): void
    {
        foreach (range(10, 16) as $n) {
            $this->ficheClient($this->agence, null, ['phone' => '+2217064820'.$n]);
        }

        Sanctum::actingAs($this->agent);
        $this->assertCount(5, $this->getJson('/api/customers/duplicates?phone=7064820')->assertOk()->json('data'));

        $role = AgencyRole::factory()->for($this->agence)->withCapabilities([Capability::PropertiesCreate])->create();
        Sanctum::actingAs($this->personnel($this->agence, agencyRole: $role));
        $data = $this->getJson('/api/customers/duplicates?phone=7064820')->assertOk()->json('data');
        $this->assertCount(5, $data);
        $this->assertSame([null], array_values(array_unique(array_column($data, 'name'))));
    }

    /** TCK-2590 — la création garde l'égalité stricte : un numéro entamé n'y fait aucun 409. */
    public function test_tck2590_la_creation_ne_compare_pas_par_prefixe(): void
    {
        $detecteur = app(CustomerDuplicateDetector::class);

        $this->assertSame([], $detecteur->find($this->agence->id, '70 648 20', null, $this->agent));
        $this->assertCount(1, $detecteur->probe($this->agence->id, '70 648 20', null, $this->agent));
    }

    /**
     * TCK-2590 — aucun joker de l'appelant n'entre dans le `LIKE` : `%` et `_` font renoncer au
     * préfixe, ils ne sont pas « nettoyés » en chiffres. Rien de plus large qu'une saisie de chiffres
     * ne revient, ni par la route ni par le détecteur.
     */
    public function test_tck2590_les_jokers_de_l_appelant_n_elargissent_rien(): void
    {
        $this->ficheClient($this->agence, null, ['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => '+221776543210']);
        $detecteur = app(CustomerDuplicateDetector::class);

        Sanctum::actingAs($this->agent);
        foreach (['70%', '7_6', '%', '_', '7%0', '7064820%', '706482_', '706_820', '7__________'] as $saisie) {
            $this->assertSame([], $this->getJson('/api/customers/duplicates?phone='.rawurlencode($saisie))->assertOk()->json('data'), $saisie);
            $this->assertSame([], $detecteur->probe($this->agence->id, $saisie, null, $this->agent), $saisie);
        }

        // Témoin : les mêmes chiffres, sans joker, trouvent Mariama et elle seule.
        $this->assertSame([$this->mariama->id], array_column($detecteur->probe($this->agence->id, '7064820', null, $this->agent), 'id'));
    }
}
