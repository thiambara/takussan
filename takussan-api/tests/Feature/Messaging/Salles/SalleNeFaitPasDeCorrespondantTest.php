<?php

namespace Tests\Feature\Messaging\Salles;

use App\Models\Enums\LeaseStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Support\ScenesDeSalles;

/**
 * TCK-2960 — une salle ne fait de personne un CORRESPONDANT (`MessagingReach`, règle 1) : ses membres y
 * sont mis par l'objet, pas choisis. Sans cette exclusion, le locataire d'un bail brouillon ou fini
 * joindrait l'agent du bail hors de la salle, alors que la règle 5 (TCK-2851) le borne aux baux EN COURS.
 */
class SalleNeFaitPasDeCorrespondantTest extends ApiTestCase
{
    use RefreshDatabase, ScenesDeSalles;

    public function test_le_locataire_d_un_bail_fini_ne_joint_pas_l_agent_par_la_salle(): void
    {
        ['lease' => $lease, 'agent' => $agent, 'tenant' => $tenant] = $this->sceneDuBail(['status' => LeaseStatus::Expired]);
        $this->assertContains($agent->id, $this->membresActifs($this->salleDe($lease)), 'prémisse : co-membres de la salle');

        $this->actingAsApi($tenant);
        $contacts = collect($this->apiGet('/api/conversations/contacts')->assertOk()->json('data'))->pluck('id')->map(fn ($id) => (int) $id)->all();

        $this->assertNotContains($agent->id, $contacts);
    }

    public function test_temoin_le_bail_en_cours_ouvre_l_agent_par_la_regle_5(): void
    {
        ['agent' => $agent, 'tenant' => $tenant] = $this->sceneDuBail(['status' => LeaseStatus::Active]);

        $this->actingAsApi($tenant);
        $contacts = collect($this->apiGet('/api/conversations/contacts')->assertOk()->json('data'))->pluck('id')->map(fn ($id) => (int) $id)->all();

        $this->assertContains($agent->id, $contacts);
    }
}
