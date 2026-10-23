<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * P188.07 (TCK-1866) — une valeur en liste là où la route attend une chaîne est ignorée comme une
 * valeur absente (le précédent de TCK-1407), et non castée en `(string)` : « Array to string
 * conversion » rendait 500 sur `include[]=` des trois tableaux de bord et sur `filter[status][]`,
 * `filter[kind][]` et `filter[agency_id][]` de la console des boosts.
 */
class ValeursEnListeTableauxDeBordEtBoostsTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_tableau_de_bord_du_bailleur(): void
    {
        $this->apiActingAsRole('owner');

        $this->apiGet('/api/dashboard/owner?include[]=timeseries')->assertOk()->assertJsonMissingPath('timeseries');
    }

    public function test_tableau_de_bord_de_l_agent(): void
    {
        $this->apiActingAsRole('agent', ['agency' => Agency::factory()->create()]);

        $this->apiGet('/api/dashboard/agent?include[]=timeseries')->assertOk()->assertJsonMissingPath('timeseries');
    }

    public function test_tableau_de_bord_de_l_agence(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $this->apiGet('/api/dashboard/agency?include[]=timeseries')->assertOk()->assertJsonMissingPath('timeseries');
    }

    public function test_console_des_boosts(): void
    {
        $this->apiActingAsRole('super_admin');

        foreach (['filter[status][]=active', 'filter[kind][]=x', 'filter[agency_id][]=1'] as $filtre) {
            $this->apiGet('/api/admin/boosts?'.$filtre)->assertOk();
        }
    }
}
