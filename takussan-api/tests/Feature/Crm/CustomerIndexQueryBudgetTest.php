<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\Enums\BookingKind;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Task;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-705 (piste P20.01) — `notes` est à la fois une colonne de `customers` et une relation
 * `HasMany` de `Customer`. `CustomerResource` rendait `$this->notes` : quand la colonne n'était pas
 * sélectionnée (`fields[customers]` du front ne la demande pas), Eloquent retombait sur la relation,
 * chargée paresseusement ligne par ligne, et la liste rendait toutes les notes internes de chaque
 * fiche, brutes. Mesuré avant correctif : 28 requêtes pour 2 clients, 48 pour 12, dont une `customer_notes` par
 * ligne.
 *
 * Le budget de requêtes de `GET /api/customers`, tout entier ici : les attributs calculés (TCK-2588, ex-
 * `CustomerListQueryCountTest`) et `suggested_stage` (TCK-2591, ex-`SuggestedStageQueryCountTest`), versés
 * par TCK-3017. Chacun bâtit son agence : le décor de `setUp()` n'y entre pas.
 */
class CustomerIndexQueryBudgetTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    /** `DASHBOARD_CUSTOMER_FIELDS` et l'`include` de `takussan-web/src/lib/queries/customers.ts`. */
    private const LISTE_DU_FRONT = '/api/customers?fields[customers]=id,first_name,last_name,email,phone,status,pipeline_stage,occupation,created_at&include=tags&per_page=20';

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->actingAsApi($this->admin);
    }

    private function clients(int $n): void
    {
        Customer::factory()->count($n)->create(['agency_id' => $this->agency->id])
            ->each(fn (Customer $c) => CustomerNote::factory()->create([
                'customer_id' => $c->id,
                'author_id' => $this->admin->id,
                'body' => 'Note interne',
            ]));
    }

    /** Les requêtes de la liste qui lisent `customer_notes`. */
    private function lecturesDeNotes(int $attendus): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $reponse = $this->getJson(self::LISTE_DU_FRONT)->assertOk();
        $requetes = DB::getQueryLog();
        DB::disableQueryLog();

        $this->assertCount($attendus, $reponse->json('data'));

        return count(array_filter($requetes, fn (array $q) => str_contains($q['query'], '"customer_notes"')));
    }

    /**
     * Le budget complet « 2 lignes = 12 lignes » n'est pas tenu ici : `isSuperAdmin()` relit encore
     * `platform_profiles` à chaque ligne (pistes P20.03 et P02.03, hors de ce ticket). Ce test
     * garde la seule requête par ligne que ce ticket retire.
     */
    public function test_la_liste_ne_lit_aucune_note(): void
    {
        $this->clients(2);
        $this->assertSame(0, $this->lecturesDeNotes(2));

        $this->clients(10);
        $this->assertSame(0, $this->lecturesDeNotes(12));
    }

    /**
     * TCK-808 (P23.02) — les champs réservés au lecteur de la fiche ne coûtent rien à une liste qui
     * ne les lit pas : `CustomerResource` ne relit pas `agency_id` et `added_by_id` de chaque ligne
     * que `fields[customers]` en a privée.
     */
    public function test_la_liste_ne_relit_aucune_fiche_pour_juger_ses_champs_reserves(): void
    {
        $lecturesDeFiches = function (int $attendus): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->assertCount($attendus, $this->getJson(self::LISTE_DU_FRONT)->assertOk()->json('data'));
            $requetes = DB::getQueryLog();
            DB::disableQueryLog();

            return count(array_filter($requetes, fn (array $q) => str_contains($q['query'], 'from "customers"')));
        };

        $this->clients(2);
        $deux = $lecturesDeFiches(2);
        $this->clients(10);
        $this->assertSame($deux, $lecturesDeFiches(12));
    }

    public function test_la_liste_ne_rend_pas_les_notes_qu_on_ne_lui_a_pas_demandees(): void
    {
        $this->clients(1);

        $ligne = $this->getJson(self::LISTE_DU_FRONT)->assertOk()->json('data.0');

        $this->assertArrayNotHasKey('notes', $ligne);
    }

    /** `notes` n'est pas dans `Customer::$queryFields` : la colonne n'est lue que sans `fields[customers]`. */
    public function test_la_colonne_notes_sort_quand_elle_est_lue(): void
    {
        Customer::factory()->create(['agency_id' => $this->agency->id, 'notes' => 'Texte de la colonne']);

        $this->getJson('/api/customers')
            ->assertOk()
            ->assertJsonPath('data.0.notes', 'Texte de la colonne');
    }

    public function test_la_relation_notes_sort_quand_elle_est_incluse(): void
    {
        $this->clients(1);
        $client = Customer::query()->firstOrFail();

        $this->getJson("/api/customers/{$client->id}?fields[customers]=id,first_name&include=notes")
            ->assertOk()
            ->assertJsonCount(1, 'data.notes')
            ->assertJsonPath('data.notes.0.body', 'Note interne');
    }

    /**
     * TCK-2588 AC4 — les attributs calculés coûtent un nombre de requêtes constant, quelle que soit la taille
     * de la page. Chaque fiche porte une visite à venir, une tâche de l'agent, une tâche échue d'un collègue
     * (dont le titre ne sort pas) et un référent : sans eux, le compte serait constant à vide.
     */
    public function test_ac4_les_attributs_calcules_coutent_autant_pour_2_et_pour_20_fiches(): void
    {
        $this->travelTo(Carbon::parse('2026-11-09 09:00:00'));
        $agence = $this->agence();
        $agent = $this->personnel($agence);
        $collegue = $this->personnel($agence);

        $fiches = function (int $n) use ($agence, $agent, $collegue): void {
            for ($i = 0; $i < $n; $i++) {
                $fiche = $this->ficheClient($agence, null, ['added_by_id' => $agent->id, 'pipeline_stage' => CustomerPipelineStage::Negotiating]);
                PropertyVisit::factory()->create([
                    'property_id' => $this->bienDe($agence)->id, 'customer_id' => $fiche->id, 'agent_id' => $agent->id,
                    'status' => VisitStatus::Confirmed, 'scheduled_at' => Carbon::parse('2026-11-12 10:00:00'),
                ]);
                Task::factory()->forCustomer($fiche)->create([
                    'title' => 'Ma tâche', 'created_by_id' => $agent->id, 'assigned_to_id' => $agent->id,
                    'due_at' => Carbon::parse('2026-11-13 10:00:00'),
                ]);
                Task::factory()->forCustomer($fiche)->create([
                    'title' => 'Tâche du collègue', 'created_by_id' => $collegue->id, 'assigned_to_id' => $collegue->id,
                    'due_at' => Carbon::parse('2026-11-08 10:00:00'),
                ]);
                UserCustomerRelationship::query()->create([
                    'user_id' => $agent->id, 'customer_id' => $fiche->id, 'relationship_type' => 'agent_client',
                    'status' => RelationshipStatus::Active, 'is_primary' => true,
                ]);
            }
        };

        $requetes = function (int $attendues) use ($agent): int {
            Sanctum::actingAs($agent);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $data = $this->getJson('/api/customers?per_page=20&fields[customers]=id,first_name,next_action,follow_up,referent,last_contacted_at&include=upcomingVisits,visitsCount')
                ->assertOk()->json('data');
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            $this->assertCount($attendues, $data);
            foreach ($data as $ligne) {
                $this->assertSame('task', $ligne['next_action']['type']);
                $this->assertNull($ligne['next_action']['label'], 'le titre de la tâche du collègue ne sort pas');
                $this->assertTrue($ligne['next_action']['overdue']);
                // TCK-2592 (décision 4) — la tâche du collègue ne se modifie pas, jugé sans requête par ligne.
                $this->assertFalse($ligne['next_action']['manage']);
                $this->assertSame('overdue_task', $ligne['follow_up']['reason']);
                $this->assertSame($agent->id, $ligne['referent']['id']);
                $this->assertCount(1, $ligne['upcoming_visits']);
                // TCK-2589 — `manage` jugé pour chaque visite à venir, sans requête par ligne.
                $this->assertTrue($ligne['upcoming_visits'][0]['manage']);
            }

            return $n;
        };

        $fiches(2);
        // Une première lecture chauffe les caches de la requête suivante (capacités du rôle, réglages de la
        // plateforme) : elles ne dépendent pas de la page.
        $requetes(2);
        $deux = $requetes(2);

        $fiches(18);
        $this->assertSame($deux, $requetes(20));
    }

    /** TCK-2591 — `suggested_stage` se calcule pour la page en requêtes groupées : leur nombre ne dépend pas du nombre de fiches. */
    public function test_suggested_stage_ne_grossit_pas_avec_la_page(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $property = Property::factory()->create(['agency_id' => $agency->id]);

        $seed = function (int $n) use ($agency, $agent, $property): void {
            foreach (range(1, $n) as $i) {
                $this->travelTo(now()->subDays(5));
                $fiche = Customer::factory()->create([
                    'agency_id' => $agency->id, 'added_by_id' => $agent->id,
                    'status' => CustomerStatus::Active, 'pipeline_stage' => CustomerPipelineStage::Lead,
                ]);
                $this->travelBack();
                PropertyVisit::factory()->create(['property_id' => $property->id, 'customer_id' => $fiche->id, 'visitor_id' => null, 'status' => VisitStatus::Confirmed]);
                Booking::factory()->create(['property_id' => $property->id, 'agency_id' => $agency->id, 'customer_id' => $fiche->id, 'created_by_id' => $agent->id, 'kind' => BookingKind::Application]);
            }
        };

        Sanctum::actingAs($agent);
        $count = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $rows = $this->getJson('/api/customers?per_page=50&fields[customers]=id,pipeline_stage,suggested_stage')->assertOk()->json('data');
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();
            $this->assertNotEmpty($rows);
            $this->assertSame('negotiating', $rows[0]['suggested_stage']['to']);

            return $n;
        };

        $seed(3);
        $count(); // échauffement
        $few = $count();

        $seed(12);
        $this->assertSame($few, $count());
    }
}
