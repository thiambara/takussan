<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\RelationshipStatus;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2889 — `sort=referent` : par le nom affiché du référent (relation `agent_client` principale et
 * active, la même que `filter[referent]`), en collation ICU ; les fiches sans référent en dernier,
 * dans les deux sens.
 */
class CustomerSortByReferentTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $awa;

    private User $khady;

    private Customer $deKhady;

    private Customer $dAwa;

    private Customer $sansReferent;

    private Customer $relationTerminee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = $this->agence();
        $this->khady = $this->personnel($this->agence, attributes: ['first_name' => 'Khady', 'last_name' => 'Sow']);
        // En minuscule : sous `--locale=C`, un tri nu la rangerait après « Khady ».
        $this->awa = $this->personnel($this->agence, attributes: ['first_name' => 'awa', 'last_name' => 'Ndiaye']);

        $this->sansReferent = $this->ficheClient($this->agence);
        $this->deKhady = $this->ficheClient($this->agence);
        $this->relationTerminee = $this->ficheClient($this->agence);
        $this->dAwa = $this->ficheClient($this->agence);

        $this->relation($this->deKhady, $this->khady);
        $this->relation($this->dAwa, $this->awa);
        // Une relation terminée ne fait pas un référent : la fiche est « sans référent ».
        $this->relation($this->relationTerminee, $this->awa, RelationshipStatus::Ended);
    }

    private function relation(Customer $fiche, User $agent, RelationshipStatus $statut = RelationshipStatus::Active): void
    {
        UserCustomerRelationship::query()->create([
            'user_id' => $agent->id, 'customer_id' => $fiche->id, 'relationship_type' => 'agent_client',
            'status' => $statut, 'is_primary' => true,
        ]);
    }

    /** @return list<int> */
    private function ids(string $tri): array
    {
        Sanctum::actingAs($this->khady);

        return collect($this->getJson('/api/customers?fields[customers]=id&sort='.$tri)->assertOk()->json('data'))
            ->pluck('id')->all();
    }

    /** AC2 — Awa avant Khady, sans référent en dernier ; à l'envers, sans référent toujours en dernier. */
    public function test_ac2_par_nom_du_referent_sans_referent_en_dernier(): void
    {
        $sans = [$this->sansReferent->id, $this->relationTerminee->id];

        $this->assertSame([$this->dAwa->id, $this->deKhady->id, ...$sans], $this->ids('referent'));
        $this->assertSame([$this->deKhady->id, $this->dAwa->id, ...array_reverse($sans)], $this->ids('-referent'));
    }

    /** Le référent est lu dans la requête de la page : le tri n'ajoute aucune requête. */
    public function test_le_tri_tient_dans_la_requete_de_la_page(): void
    {
        Sanctum::actingAs($this->khady);
        $this->getJson('/api/customers?fields[customers]=id&sort=id')->assertOk();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson('/api/customers?fields[customers]=id&sort=id')->assertOk();
        $sansTri = count(DB::getQueryLog());

        DB::flushQueryLog();
        $this->getJson('/api/customers?fields[customers]=id&sort=referent')->assertOk();
        $avecTri = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertSame($sansTri, $avecTri);
    }
}
