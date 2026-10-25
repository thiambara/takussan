<?php

namespace Tests\Feature\Api;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\LeaseDueFixture;

/**
 * P216.04 (TCK-2126) — la file des avis et l'échéancier d'un bail castaient `(string)` leur `sort` :
 * `sort[]=…` rendait 500 « Array to string conversion ». Une liste vaut désormais l'ordre par défaut
 * (TCK-1407, TCK-1866).
 */
class ValeursEnListeTriDesAvisEtDeLEcheancierTest extends ApiTestCase
{
    use LeaseDueFixture;
    use RefreshDatabase;

    public function test_file_des_avis(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/reviews?sort[]=rating')->assertOk();
    }

    public function test_echeancier_d_un_bail(): void
    {
        $ctx = $this->leaseDue();
        Sanctum::actingAs($ctx['tenant']);

        $this->getJson("/api/leases/{$ctx['lease']->id}/payments?sort[]=due_date")
            ->assertOk()
            ->assertJsonPath('data.0.id', $ctx['payment']->id);
    }
}
