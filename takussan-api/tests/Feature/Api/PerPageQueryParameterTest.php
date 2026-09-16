<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * `per_page` est honoré par toute liste construite sur `HasQueryBuilder`.
 *
 * Relevé le 2026-09-16 (revue design) : `docs/spatie-query-builder.md` promet
 * `GET /api/properties?per_page=50`, le front l'envoie sur 130 appels (20, 30, 50, 100…), et
 * vingt-deux contrôleurs appellent `->paginate()` sans argument — l'API rendait 15 lignes à
 * TOUS. Le sélecteur de densité des listes ne changeait rien, chaque colonne du kanban
 * plafonnait à 15 clients, et les sélecteurs qui chargent « les 100 premiers » en montraient 15.
 */
class PerPageQueryParameterTest extends ApiTestCase
{
    use RefreshDatabase;

    private function listeDe(int $n): User
    {
        $user = User::factory()->create();
        Customer::factory()->count($n)->create(['added_by_id' => $user->id]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_per_page_is_honoured(): void
    {
        $this->listeDe(7);

        $response = $this->getJson('/api/customers?per_page=5')->assertOk();

        $this->assertCount(5, $response->json('data'));
        $this->assertSame(5, $response->json('meta.per_page'));
        $this->assertSame(2, $response->json('meta.last_page'));
    }

    public function test_per_page_above_the_ceiling_is_capped(): void
    {
        $this->listeDe(1);

        $this->getJson('/api/customers?per_page=100000')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 100);
    }

    public function test_absent_or_invalid_per_page_keeps_the_model_default(): void
    {
        $this->listeDe(1);
        $defaut = (new Customer)->getPerPage();

        foreach (['', '?per_page=abc', '?per_page=0', '?per_page=-3'] as $suffixe) {
            $this->getJson('/api/customers'.$suffixe)
                ->assertOk()
                ->assertJsonPath('meta.per_page', $defaut);
        }
    }
}
