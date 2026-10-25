<?php

namespace Tests\Feature\Admin;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * P216.01 (TCK-2120) — les consoles super-admin des comptes, des agences, des biens en modération
 * et des portefeuilles lisaient leurs filtres par `$request->string()` et leur tri par `(string)` :
 * une valeur en liste rendait 500 « Array to string conversion ». Elle vaut désormais une valeur
 * absente (le précédent de TCK-1407 et TCK-1866).
 */
class ValeursEnListeConsolesAdminTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->apiActingAsRole('super_admin');
    }

    public function test_console_des_comptes(): void
    {
        foreach ([
            'filter[search][]=x',
            'filter[status][]=x',
            'filter[role][]=x',
            'filter[agency_id][]=1',
            'sort[]=x',
        ] as $parametre) {
            $this->apiGet('/api/admin/users?'.$parametre)->assertOk();
        }
    }

    public function test_console_des_agences(): void
    {
        foreach ([
            'filter[status][]=x',
            'filter[search][]=x',
            'filter[is_verified][]=1',
            'filter[created_from][]=2026-01-01',
            'filter[created_to][]=2026-01-01',
            'sort[]=x',
        ] as $parametre) {
            $this->apiGet('/api/admin/agencies?'.$parametre)->assertOk();
        }
    }

    public function test_file_de_moderation_des_biens(): void
    {
        $this->apiGet('/api/properties/moderation?filter[search][]=x')->assertOk();
    }

    public function test_console_des_portefeuilles(): void
    {
        $this->apiGet('/api/admin/credit-wallets?search[]=x')->assertOk();
    }
}
