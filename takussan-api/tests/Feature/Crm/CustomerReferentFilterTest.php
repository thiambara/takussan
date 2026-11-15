<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\RelationshipStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Models\UserCustomerRelationship;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2588 — le référent d'une fiche (relation `agent_client` principale et active) : rendu par
 * `fields[customers]=referent`, filtré par `filter[referent]=me|none|{id}`.
 */
class CustomerReferentFilterTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $agence;

    private User $agent;

    private User $collegue;

    private Customer $mienne;

    private Customer $sienne;

    private Customer $orpheline;

    private Customer $terminee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence, attributes: ['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $this->collegue = $this->personnel($this->agence);

        $this->mienne = $this->ficheClient($this->agence);
        $this->sienne = $this->ficheClient($this->agence);
        $this->orpheline = $this->ficheClient($this->agence);
        $this->terminee = $this->ficheClient($this->agence);

        $this->relation($this->mienne, $this->agent);
        $this->relation($this->sienne, $this->collegue);
        // Une relation non principale, ou terminée, ne fait pas un référent.
        $this->relation($this->orpheline, $this->agent, primaire: false);
        $this->relation($this->terminee, $this->agent, statut: RelationshipStatus::Ended);
    }

    private function relation(Customer $fiche, User $agent, bool $primaire = true, RelationshipStatus $statut = RelationshipStatus::Active): void
    {
        UserCustomerRelationship::query()->create([
            'user_id' => $agent->id, 'customer_id' => $fiche->id, 'relationship_type' => 'agent_client',
            'status' => $statut, 'is_primary' => $primaire,
        ]);
    }

    /** @return list<int> */
    private function ids(string $filtre, ?User $lecteur = null): array
    {
        Sanctum::actingAs($lecteur ?? $this->agent);

        return collect($this->getJson('/api/customers?fields[customers]=id&'.$filtre)->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();
    }

    public function test_me_none_et_un_identifiant(): void
    {
        $this->assertSame([$this->mienne->id], $this->ids('filter[referent]=me'));
        $this->assertSame([$this->sienne->id], $this->ids('filter[referent]='.$this->collegue->id));
        $this->assertSame(
            collect([$this->orpheline->id, $this->terminee->id])->sort()->values()->all(),
            $this->ids('filter[referent]=none'),
        );
    }

    public function test_le_referent_est_rendu_quand_il_est_demande(): void
    {
        Sanctum::actingAs($this->agent);
        $data = collect($this->getJson('/api/customers?fields[customers]=id,referent')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame(['id' => $this->agent->id, 'name' => 'Awa Ndiaye'], $data[$this->mienne->id]['referent']);
        $this->assertNull($data[$this->orpheline->id]['referent']);
    }

    /**
     * `me` vaut dans l'agence active : l'agent, personnel de DEUX agences, a ajouté une fiche dans
     * l'autre (il la lit, c'est son ajout) et en est le référent ; sous le profil de celle-ci, elle
     * n'est pas « à moi ».
     */
    public function test_me_se_limite_a_l_agence_active_et_une_autre_agence_ne_rend_rien(): void
    {
        $ailleurs = $this->agence();
        AgentProfile::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $ailleurs->id]);
        $ficheAilleurs = $this->ficheClient($ailleurs, null, ['added_by_id' => $this->agent->id]);
        $this->relation($ficheAilleurs, $this->agent);

        $profilIci = AgentProfile::query()->where('user_id', $this->agent->id)->where('agency_id', $this->agence->id)->value('id');
        Sanctum::actingAs($this->agent);
        $sousCeProfil = fn (string $filtre) => collect($this->withHeaders(['X-Profile-Id' => "agent:{$profilIci}"])
            ->getJson('/api/customers?fields[customers]=id&'.$filtre)->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();

        // La fiche de l'autre agence est lisible (son ajout) : elle sort sous le référent nommé…
        $this->assertContains($ficheAilleurs->id, $sousCeProfil('filter[referent]='.$this->agent->id));
        // … mais pas sous `me`, qui vaut dans l'agence active.
        $this->assertSame([$this->mienne->id], $sousCeProfil('filter[referent]=me'));

        // Un agent de l'autre agence ne voit, sous ce référent, que la fiche de SON agence.
        $this->flushHeaders();
        $etranger = $this->personnel($ailleurs);
        $this->assertSame([$ficheAilleurs->id], $this->ids('filter[referent]='.$this->agent->id, $etranger));
    }

    public function test_une_valeur_illisible_rend_422(): void
    {
        Sanctum::actingAs($this->agent);
        $this->getJson('/api/customers?filter[referent]=abc')->assertStatus(422);
        $this->getJson('/api/customers?filter[referent][]=me')->assertStatus(422);
    }
}
