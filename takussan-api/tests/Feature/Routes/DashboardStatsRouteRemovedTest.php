<?php

namespace Tests\Feature\Routes;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-952 (P45.03) — `GET /api/dashboard/stats` n'existe plus : aucun écran ne l'appelait, et sa
 * clé divergeait selon le profil (`active_leases`, `active_lease` pour le locataire). Les chiffres
 * de chaque tableau de bord viennent de `dashboard/me`, `agency`, `owner`, `agent` et `tenant`.
 */
class DashboardStatsRouteRemovedTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_route_des_statistiques_n_est_plus_servie(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $status = $this->getJson('/api/dashboard/stats')->status();

        $this->assertContains($status, [404, 405], "GET /api/dashboard/stats répond {$status}");
    }

    public function test_l_entree_adaptative_reste_servie(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/dashboard/me')->assertOk();
    }
}
