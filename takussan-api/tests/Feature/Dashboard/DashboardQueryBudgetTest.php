<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * TCK-595 — AC6 : le nombre de requêtes d'un tableau de bord ne dépend ni de la profondeur de la
 * série (`months`) ni du nombre de baux.
 *
 * L'ancien code en faisait trois par mois et par série (36 mois → plus de cent requêtes). Le plafond
 * est la valeur mesurée à l'implémentation : une requête de plus le fait rougir, et c'est voulu — un
 * relèvement se décide, il ne glisse pas.
 */
class DashboardQueryBudgetTest extends ApiTestCase
{
    use RefreshDatabase;

    /** Valeurs mesurées le 2026-10-08, toutes strictement inférieures à 34. */
    private const CEILINGS = [
        'owner' => 26,
        'agent' => 25,
        'agency' => 29,
    ];

    /** @return array<string, array{string, string}> */
    public static function dashboards(): array
    {
        return [
            'bailleur' => ['owner', '/api/dashboard/owner'],
            'agent' => ['agent', '/api/dashboard/agent'],
            'agence' => ['agency_admin', '/api/dashboard/agency'],
        ];
    }

    private function queries(string $url): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson($url)->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    private function leases(Agency $agency, User $owner, int $count): void
    {
        foreach (range(1, $count) as $i) {
            $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $agency->id]);
            Lease::factory()->create([
                'property_id' => $property->id,
                'landlord_id' => $owner->id,
                'agency_id' => $agency->id,
                'status' => LeaseStatus::Active,
                'start_date' => now()->subMonths($i)->toDateString(),
                'end_date' => now()->addYear()->toDateString(),
                'signed_at' => now()->subMonths($i),
                'commission_amount' => 10_000,
            ]);
        }
    }

    #[DataProvider('dashboards')]
    public function test_ac6_the_query_count_depends_neither_on_months_nor_on_leases(string $role, string $endpoint): void
    {
        Carbon::setTestNow('2026-07-15 10:00:00');
        $agency = Agency::factory()->create();
        $user = $this->apiActingAsRole($role, ['agency' => $agency]);
        $owner = $role === 'owner' ? $user : User::factory()->create();
        $this->leases($agency, $owner, 1);

        $this->getJson("{$endpoint}?include=timeseries&months=1")->assertOk();
        $oneMonth = $this->queries("{$endpoint}?include=timeseries&months=1");
        $threeYears = $this->queries("{$endpoint}?include=timeseries&months=36");

        $this->leases($agency, $owner, 19);
        $twentyLeases = $this->queries("{$endpoint}?include=timeseries&months=36");

        $this->assertSame($oneMonth, $threeYears, 'months=1 et months=36');
        $this->assertSame($threeYears, $twentyLeases, '1 bail et 20 baux');
        $key = $role === 'agency_admin' ? 'agency' : $role;
        $this->assertLessThanOrEqual(self::CEILINGS[$key], $oneMonth, "plafond {$key}, mesuré : {$oneMonth}");
    }
}
