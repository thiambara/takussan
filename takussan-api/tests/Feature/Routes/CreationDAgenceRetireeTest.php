<?php

namespace Tests\Feature\Routes;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2311 (P225.06, décision du porteur) — `POST /api/agencies` est retirée. Elle faisait de tout
 * compte connecté l'administrateur principal d'une agence `standard`, sans profil
 * d'administrateur, crédits de bienvenue compris, hors de la console (`AgencyProvisioningService`)
 * et de la demande de passage professionnel (TCK-267). Le front ne l'appelait pas.
 */
class CreationDAgenceRetireeTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_compte_connecte_ne_cree_plus_d_agence(): void
    {
        Sanctum::actingAs(User::factory()->create());
        $avant = Agency::query()->count();

        // 405 et non 404 : `GET api/agencies` (la liste) reste sur ce chemin, et Laravel répond
        // « méthode non permise » à une méthode qu'aucune route du chemin ne porte plus.
        $this->postJson('/api/agencies', ['name' => 'Agence du dehors'])
            ->assertStatus(405)
            ->assertJsonPath('code', 'http.method_not_allowed');

        $this->assertSame($avant, Agency::query()->count());
        $this->assertDatabaseMissing('agencies', ['name' => 'Agence du dehors']);
    }

    public function test_la_creation_n_est_plus_enregistree_et_ses_voisines_le_restent(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())
            ->flatMap(fn ($r) => array_map(fn (string $m) => $m.' '.$r->uri(), $r->methods()))
            ->all();

        $this->assertNotContains('POST api/agencies', $routes, 'une agence se crée par la console ou par l\'espace hôte');

        foreach ([
            'GET api/agencies',
            'GET api/agencies/{agency}',
            'PATCH api/agencies/{agency}',
            'POST api/agencies/{agency}/members',
            'POST api/admin/agencies',
        ] as $voisine) {
            $this->assertContains($voisine, $routes, "$voisine n'est pas touchée");
        }
    }
}
