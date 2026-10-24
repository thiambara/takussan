<?php

namespace Tests\Feature\Routes;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * TCK-1499 (P129.06, ADR-0048, amendement du 2026-10-22) — une agence ne se supprime pas, elle
 * sort du cycle de vie par son statut. `DELETE api/agencies/{agency}` est retirée ; les `DELETE`
 * voisins sous `api/agencies/{agency}/…` restent.
 */
class SuppressionDAgenceRetireeTest extends TestCase
{
    public function test_la_suppression_d_agence_n_est_plus_enregistree_et_ses_voisines_le_restent(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())
            ->flatMap(fn ($r) => array_map(fn (string $m) => $m.' '.$r->uri(), $r->methods()))
            ->all();

        $this->assertNotContains('DELETE api/agencies/{agency}', $routes, 'une agence sort du cycle de vie par son statut (ADR-0048)');

        foreach ([
            'DELETE api/agencies/{agency}/agents/{user}',
            'DELETE api/agencies/{agency}/members/{user}',
            'DELETE api/agencies/{agency}/absences/{delegation}',
            'DELETE api/agencies/{agency}/role-delegations/{delegation}',
            'DELETE api/agencies/{agency}/roles/{role}',
            'DELETE api/agencies/{agency}/upgrade-requests/{upgradeRequest}',
        ] as $voisine) {
            $this->assertContains($voisine, $routes, "$voisine n'est pas touchée");
        }
    }
}
