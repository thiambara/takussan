<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\CustomerNote;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-705 (piste P20.01) — `notes` est à la fois une colonne de `customers` et une relation
 * `HasMany` de `Customer`. `CustomerResource` rendait `$this->notes` : quand la colonne n'était pas
 * sélectionnée (`fields[customers]` du front ne la demande pas), Eloquent retombait sur la relation,
 * chargée paresseusement ligne par ligne, et la liste rendait toutes les notes internes de chaque
 * fiche, brutes. Mesuré avant correctif : 28 requêtes pour 2 clients, 48 pour 12, dont une `customer_notes` par
 * ligne.
 */
class CustomerIndexQueryBudgetTest extends ApiTestCase
{
    use CreatesAgencyMembers;
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
}
