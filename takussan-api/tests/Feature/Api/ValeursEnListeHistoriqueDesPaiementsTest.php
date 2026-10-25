<?php

namespace Tests\Feature\Api;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * P216.02 (TCK-2122) — `PaymentController::history` castait `(string)` `filter[status]`,
 * `filter[entity_type]` et `sort` : une valeur en liste rendait 500 « Array to string conversion ».
 * Un statut en liste se lit comme un statut inconnu (422 `payment.filter_status_invalid`) ; un type
 * d'entité ou un tri en liste valent une valeur absente (TCK-1407, TCK-1866).
 */
class ValeursEnListeHistoriqueDesPaiementsTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->apiActingAsRole('super_admin');
    }

    public function test_statut_en_liste_rend_le_422_d_un_statut_inconnu(): void
    {
        $this->apiGet('/api/payments/history?filter[status][]=paid')
            ->assertStatus(422)
            ->assertJsonPath('code', 'payment.filter_status_invalid');
    }

    public function test_type_d_entite_en_liste_est_ignore(): void
    {
        $this->apiGet('/api/payments/history?filter[entity_type][]=lease&filter[entity_id]=1')->assertOk();
    }

    public function test_tri_en_liste_est_ignore(): void
    {
        $this->apiGet('/api/payments/history?sort[]=amount')->assertOk();
    }
}
