<?php

namespace Tests\Feature\Database;

use App\Models\Agency;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\PropertyVisit;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-864 (P02.06) — une borne de jour sur un horodatage s'écrit en plage, jamais par `::date`.
 *
 * `whereDate()` compile en `"col"::date >= ?` sous PostgreSQL : le cast interdit l'usage d'un
 * index sur la colonne. Sur un `timestamp without time zone` en UTC, la plage
 * `[début du jour, lendemain)` rend exactement les mêmes lignes.
 */
class TimestampDayRangeTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private const CAST = '/"(?:scheduled_at|due_at|created_at|paid_at|earned_at)"::date/';

    /** @return array<string, array{string, string}> */
    public static function routes(): array
    {
        return [
            'calendrier (visites, interventions)' => ['admin', '/api/calendar?types[]=visit&types[]=maintenance&start_date=2026-07-15&end_date=2026-07-15'],
            'tableau de bord agent (tâches, visites du jour)' => ['agent', '/api/dashboard/agent'],
            'liste des biens (created_from, created_to)' => ['admin', '/api/properties?filter[created_from]=2026-07-01&filter[created_to]=2026-07-15'],
            'historique des paiements' => ['admin', '/api/payments/history?filter[date_from]=2026-07-01&filter[date_to]=2026-07-15'],
            'export des biens' => ['admin', '/api/export/properties?format=csv&from=2026-07-01&to=2026-07-15'],
            'export des clients' => ['admin', '/api/export/customers?format=csv&from=2026-07-01&to=2026-07-15'],
        ];
    }

    #[DataProvider('routes')]
    public function test_no_day_cast_on_a_timestamp(string $who, string $uri): void
    {
        Carbon::setTestNow('2026-07-15 09:00:00');
        $agency = Agency::factory()->create();
        $user = $who === 'admin' ? $this->agencyAdmin($agency) : $this->agencyAgent($agency);

        $casts = [];
        DB::listen(function (QueryExecuted $q) use (&$casts): void {
            if (preg_match(self::CAST, $q->sql)) {
                $casts[] = $q->sql;
            }
        });

        $this->actingAsApi($user)->getJson($uri)->assertOk();

        $this->assertSame([], $casts, 'borne de jour écrite par un cast `::date`');
    }

    public function test_the_calendar_day_keeps_its_last_second_and_drops_the_next_midnight(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->agencyAdmin($agency);
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        $visit = fn (string $at) => PropertyVisit::factory()->create([
            'property_id' => $property->id,
            'agent_id' => $admin->id,
            'status' => VisitStatus::Scheduled,
            'scheduled_at' => $at,
        ]);
        $avant = $visit('2026-07-14 23:59:59');
        $debut = $visit('2026-07-15 00:00:00');
        $fin = $visit('2026-07-15 23:59:59');
        $apres = $visit('2026-07-16 00:00:00');

        $keys = collect($this->actingAsApi($admin)
            ->getJson('/api/calendar?types[]=visit&start_date=2026-07-15&end_date=2026-07-15')
            ->assertOk()->json('data'))->pluck('id')->sort()->values()->all();

        $this->assertSame([$debut->id, $fin->id], $keys);
        $this->assertNotContains($avant->id, $keys);
        $this->assertNotContains($apres->id, $keys);
    }

    public function test_the_dashboard_counts_today_by_the_whole_day(): void
    {
        Carbon::setTestNow('2026-07-15 09:00:00');
        $agency = Agency::factory()->create();
        $agent = $this->agencyAgent($agency);
        $property = Property::factory()->create(['agency_id' => $agency->id]);
        foreach (['2026-07-14 23:59:59', '2026-07-15 00:00:00', '2026-07-15 23:59:59', '2026-07-16 00:00:00'] as $at) {
            PropertyVisit::factory()->create([
                'property_id' => $property->id,
                'agent_id' => $agent->id,
                'status' => VisitStatus::Confirmed,
                'scheduled_at' => $at,
            ]);
        }

        $today = $this->actingAsApi($agent)->getJson('/api/dashboard/agent')->assertOk()->json('data.visits.today');

        $this->assertSame(2, $today);
    }

    public function test_the_property_filter_keeps_the_whole_last_day(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->agencyAdmin($agency);
        $create = fn (string $at) => Property::factory()->create(['agency_id' => $agency->id, 'created_at' => $at])->id;
        $create('2026-06-30 23:59:59');
        $debut = $create('2026-07-01 00:00:00');
        $fin = $create('2026-07-15 23:59:59');
        $create('2026-07-16 00:00:00');

        $ids = collect($this->actingAsApi($admin)
            ->getJson('/api/properties?filter[created_from]=2026-07-01&filter[created_to]=2026-07-15&per_page=50')
            ->assertOk()->json('data'))->pluck('id')->sort()->values()->all();

        $this->assertSame([$debut, $fin], $ids);
    }

    public function test_the_calendar_visits_are_read_by_the_scheduled_at_index(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->agencyAdmin($agency);

        $requete = null;
        DB::listen(function (QueryExecuted $q) use (&$requete): void {
            if ($requete === null && str_starts_with($q->sql, 'select * from "property_visits"')) {
                $requete = [$q->sql, $q->bindings];
            }
        });

        $this->actingAsApi($admin)->getJson('/api/calendar?types[]=visit&start_date=2026-07-01&end_date=2026-07-31')->assertOk();
        $this->assertNotNull($requete, 'la requête des visites du calendrier n\'a pas été vue');

        // La table de test est vide : sans cela, le moteur la balaierait quel que soit l'index.
        DB::statement('SET LOCAL enable_seqscan = off');
        $plan = collect(DB::select('EXPLAIN '.$requete[0], $requete[1]))->pluck('QUERY PLAN')->implode("\n");

        // L'index n'est pas nommé : sur une table vide, les deux index qui portent `scheduled_at`
        // (`scheduled_at_status`, `property_id_scheduled_at`) coûtent pareil, et le moteur prend
        // l'un ou l'autre d'une exécution à l'autre (CI rouge du 2026-10-18, #622). Ce que TCK-864
        // garantit, c'est que la borne est une CONDITION D'INDEX sur `property_visits` : un
        // `whereDate()` la rejetterait en `Filter`, sur `(scheduled_at)::date`.
        $this->assertMatchesRegularExpression(
            '/Scan using property_visits_\w+ on property_visits[^\n]*\n\s+Index Cond: [^\n]*scheduled_at >=/',
            $plan,
            $plan,
        );
    }
}
