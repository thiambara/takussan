<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Property;
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

    /**
     * La forme du show sous `fields[customers]=id,first_name` (décision a : le show rend toutes ses
     * colonnes). Vérification adverse de TCK-2756 (d1) : les sept critères y entrent pour le personnel —
     * ils manquaient non parce qu'ils n'étaient pas demandés, mais parce que leur règle se jugeait sur
     * une fiche lue sans son agence, et refusait.
     */
    private const FORME_DU_SHOW_ID_PRENOM = [
        'id', 'first_name', 'last_name', 'email', 'phone', 'id_type', 'id_number_masked', 'occupation',
        'emergency_contact_name', 'emergency_contact_phone', 'status', 'pipeline_stage', 'locale',
        'agency_id', 'user_id', 'added_by_id', 'metadata', 'last_contacted_at', 'created_at', 'updated_at',
        'seeking_contract_type', 'budget_min', 'budget_max', 'seeking_property_types', 'seeking_cities',
        'seeking_neighborhoods', 'min_bedrooms',
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

    /**
     * Vérification adverse de TCK-2756 (d2) — un include `belongsTo` (`addedBy`, `interestedProperty`…) sous
     * des attributs calculés seuls : sa clé étrangère rejoint la lecture, sans être émise. Sans elle, la
     * relation se rendait `null` (« fiche sans auteur »), le null-pour-absent que le ticket retire.
     */
    public function test_d2_un_include_garde_sa_cle_etrangere_sans_l_emettre(): void
    {
        $auteur = User::factory()->create(['first_name' => 'Awa']);
        $bien = Property::factory()->create(['agency_id' => $this->agency->id]);
        Customer::query()->update(['added_by_id' => $auteur->id, 'interested_property_id' => $bien->id]);

        $lignes = $this->getJson('/api/customers?fields[customers]=next_action&include=addedBy,interestedProperty')->assertOk()->json('data');

        $this->assertClesDeChaqueLigne(['id', 'next_action', 'added_by', 'interested_property'], $lignes);
        $this->assertSame($auteur->id, $lignes[0]['added_by']['id'] ?? null);
        $this->assertSame($bien->id, $lignes[0]['interested_property']['id'] ?? null);

        // Avec des colonnes demandées, de même : la clé étrangère est lue pour l'include, pas rendue.
        $lignes = $this->getJson('/api/customers?fields[customers]=id,first_name&include=addedBy')->assertOk()->json('data');
        $this->assertClesDeChaqueLigne(['id', 'first_name', 'added_by'], $lignes);
        $this->assertSame($auteur->id, $lignes[0]['added_by']['id'] ?? null);
    }

    /**
     * Vérification adverse de abfa84589 — un nom d'include n'appelle jamais une méthode du modèle qui
     * n'est pas une relation déclarée (`Customer::$requestLoadable`). La lecture des clés étrangères
     * des includes appelait `$modele->{$include}()` AVANT que spatie ne refuse l'include : `unguard`
     * levait la protection d'affectation de masse pour tout le processus, `save` tentait un INSERT,
     * `removeAllFromSearch` vidait l'index. La liste est ouverte à tout compte authentifié.
     */
    public function test_un_include_qui_n_est_pas_une_relation_declaree_n_appelle_rien(): void
    {
        $this->actingAsApi(User::factory()->create());
        $avant = Customer::query()->count();

        foreach (['unguard', 'save', 'increment', 'touch', 'delete', 'replicate'] as $methode) {
            $this->getJson("/api/customers?fields[customers]=next_action&include={$methode}")->assertStatus(400);
            $this->getJson("/api/customers?fields[customers]=id,first_name&include=tags,{$methode}")->assertStatus(400);
        }

        $this->assertFalse(Customer::isUnguarded(), 'include=unguard a levé la protection d\'affectation de masse');
        $this->assertSame($avant, Customer::query()->count());
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
