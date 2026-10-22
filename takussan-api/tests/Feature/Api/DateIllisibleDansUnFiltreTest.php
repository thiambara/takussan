<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-1405 (P151.04) — une date illisible dans un filtre de date rend 422 par la règle `date`
 * (celle de `DateBoundaryFilter` et des requêtes d'export), plus un 500 levé par `Carbon::parse()`
 * ou par PostgreSQL. Une date lisible filtre toujours.
 */
class DateIllisibleDansUnFiltreTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return array<string, array{0: string, 1: string}> */
    public static function routesDeLAgence(): array
    {
        return [
            'biens, created_from' => ['/api/properties', 'created_from'],
            'biens, created_to' => ['/api/properties', 'created_to'],
            'historique des paiements, date_from' => ['/api/payments/history', 'date_from'],
            'historique des paiements, date_to' => ['/api/payments/history', 'date_to'],
            'journal, date_to' => ['/api/activity-log', 'date_to'],
            'journal d\'audit, date_from' => ['/api/audit-log', 'date_from'],
        ];
    }

    #[DataProvider('routesDeLAgence')]
    public function test_une_date_illisible_est_refusee_en_422_chez_l_agence(string $route, string $filtre): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => Agency::factory()->create()]);

        $this->apiGet("{$route}?filter[{$filtre}]=abc")->assertStatus(422);
        $this->apiGet("{$route}?filter[{$filtre}]=2026-10-22")->assertOk();
    }

    public function test_une_date_illisible_est_refusee_en_422_par_la_moderation_des_agences(): void
    {
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/admin/agencies?filter[created_from]=abc')->assertStatus(422);
        $this->apiGet('/api/admin/agencies?filter[created_to]=abc')->assertStatus(422);
        $this->apiGet('/api/admin/agencies?filter[created_from]=2026-10-22')->assertOk();
    }

    /** TCK-1407 (P151.06) — une liste là où une date est attendue : 422, plus `Array to string conversion`. */
    public function test_une_liste_de_dates_est_refusee_en_422(): void
    {
        $this->apiActingAsRole('agency_admin', ['agency' => Agency::factory()->create()]);

        $this->apiGet('/api/properties?filter[created_to][]=2026-10-22')->assertStatus(422);
    }
}
