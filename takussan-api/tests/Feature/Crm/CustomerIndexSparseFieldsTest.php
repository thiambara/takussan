<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2756 (décision du porteur : a — seule la LISTE change) — `GET /api/customers` honore
 * `fields[customers]` :
 *  1. une colonne que la lecture n'a pas demandée est ABSENTE de chaque ligne, pas rendue à `null`
 *     (`null` se lisait « ce client n'a pas d'e-mail ») ;
 *  2. des attributs calculés seuls (`next_action`…) ne font plus retomber spatie sur `select *` : la
 *     ligne rend `id` et l'attribut, sans notes, critères ni masque de pièce (déchiffré à chaque ligne).
 *
 * Le show et les autres lecteurs de la ressource (bail, réservation) gardent leur forme : la fiche
 * client envoie au show des attributs calculés seuls POUR recevoir la ressource entière (TCK-2589).
 *
 * Les clés sont comparées à `assertSame` sur la liste triée : `assertJsonStructure` accepterait les
 * clés en trop, c'est-à-dire le défaut même.
 */
class CustomerIndexSparseFieldsTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    /** La forme de la liste sans `fields`, relevée avant le correctif (personnel de l'agence). */
    private const FORME_SANS_FIELDS = [
        'id', 'first_name', 'last_name', 'email', 'phone', 'id_type', 'id_number_masked', 'occupation',
        'emergency_contact_name', 'emergency_contact_phone', 'status', 'pipeline_stage', 'locale',
        'agency_id', 'user_id', 'added_by_id', 'metadata', 'notes', 'seeking_contract_type', 'budget_min',
        'budget_max', 'seeking_property_types', 'seeking_cities', 'seeking_neighborhoods', 'min_bedrooms',
        'last_contacted_at', 'created_at', 'updated_at',
    ];

    /** La forme du show sous `fields[customers]=id,first_name`, relevée avant le correctif : inchangée. */
    private const FORME_DU_SHOW_ID_PRENOM = [
        'id', 'first_name', 'last_name', 'email', 'phone', 'id_type', 'id_number_masked', 'occupation',
        'emergency_contact_name', 'emergency_contact_phone', 'status', 'pipeline_stage', 'locale',
        'agency_id', 'user_id', 'added_by_id', 'metadata', 'last_contacted_at', 'created_at', 'updated_at',
    ];

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        Customer::factory()->count(3)->create([
            'agency_id' => $this->agency->id,
            'email' => 'client@example.sn',
            'phone' => '+221770000001',
            'occupation' => 'Comptable',
            'notes' => 'Note interne',
            'id_number' => '1234567890123',
        ]);
        $this->actingAsApi($this->admin);
    }

    /**
     * @param  list<string>  $attendues
     * @param  list<array<string, mixed>>  $lignes
     */
    private function assertClesDeChaqueLigne(array $attendues, array $lignes): void
    {
        $this->assertCount(3, $lignes);
        sort($attendues);
        foreach ($lignes as $ligne) {
            $cles = array_keys($ligne);
            sort($cles);
            $this->assertSame($attendues, $cles);
        }
    }

    /** @return list<string> les requêtes de lecture des fiches émises par `$url` */
    private function lecturesDesFiches(string $url): array
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson($url)->assertOk();
        $requetes = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();

        return array_values(array_filter($requetes, fn (string $q) => preg_match('/^select .* from "customers"/', $q) === 1));
    }

    public function test_ac1_les_colonnes_rendues_sont_les_colonnes_demandees(): void
    {
        $lignes = $this->getJson('/api/customers?fields[customers]=id,first_name&per_page=20')->assertOk()->json('data');

        $this->assertClesDeChaqueLigne(['id', 'first_name'], $lignes);
    }

    public function test_ac1_une_colonne_demandee_et_vide_reste_rendue_a_null(): void
    {
        Customer::query()->update(['occupation' => null]);

        $lignes = $this->getJson('/api/customers?fields[customers]=id,occupation')->assertOk()->json('data');

        $this->assertClesDeChaqueLigne(['id', 'occupation'], $lignes);
        $this->assertNull($lignes[0]['occupation'], 'demandée et vide : null, comme avant');
    }

    public function test_ac2_des_attributs_calcules_seuls_ne_lisent_pas_la_fiche_entiere(): void
    {
        $url = '/api/customers?fields[customers]=next_action&per_page=20';
        $lignes = $this->getJson($url)->assertOk()->json('data');

        $this->assertClesDeChaqueLigne(['id', 'next_action'], $lignes);

        $lectures = $this->lecturesDesFiches($url);
        $this->assertNotEmpty($lectures, 'la page est lue');
        foreach ($lectures as $sql) {
            $this->assertDoesNotMatchRegularExpression('/^select (\*|"customers"\.\*) from "customers"/', $sql, 'pas de select * : '.$sql);
            $this->assertStringNotContainsString('"id_number"', $sql, 'aucune pièce lue (ni déchiffrée) pour la liste');
            $this->assertStringNotContainsString('"notes"', $sql);
        }
    }

    public function test_ac2_un_attribut_calcule_avec_des_colonnes_rend_ces_colonnes_seules(): void
    {
        $lignes = $this->getJson('/api/customers?fields[customers]=id,first_name,next_action,referent')->assertOk()->json('data');

        $this->assertClesDeChaqueLigne(['id', 'first_name', 'next_action', 'referent'], $lignes);
    }

    public function test_ac3_sans_fields_la_liste_garde_sa_forme(): void
    {
        $lignes = $this->getJson('/api/customers')->assertOk()->json('data');

        $this->assertClesDeChaqueLigne(self::FORME_SANS_FIELDS, $lignes);
    }

    public function test_decision_a_le_show_garde_sa_forme(): void
    {
        $id = (int) Customer::query()->value('id');

        $cles = array_keys($this->getJson("/api/customers/{$id}?fields[customers]=id,first_name")->assertOk()->json('data'));
        $attendues = self::FORME_DU_SHOW_ID_PRENOM;
        sort($cles);
        sort($attendues);
        $this->assertSame($attendues, $cles, 'le show sous fields : inchangé (décision a)');

        // La fiche client (TCK-2589) : des attributs calculés seuls au show rendent la ressource entière.
        $fiche = $this->getJson("/api/customers/{$id}?fields[customers]=next_action,follow_up,referent")->assertOk()->json('data');
        foreach (['email', 'phone', 'notes', 'id_number_masked', 'next_action', 'follow_up', 'referent'] as $cle) {
            $this->assertArrayHasKey($cle, $fiche);
        }
        $this->assertSame('client@example.sn', $fiche['email']);
    }
}
