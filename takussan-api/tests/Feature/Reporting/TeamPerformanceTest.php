<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-595 — AC17 : la performance d'équipe, une ligne par agent actif, en requêtes groupées.
 */
class TeamPerformanceTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-07-20 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id]);
    }

    private function signed(User $agent, string $at): void
    {
        Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'agent_id' => $agent->id,
            'status' => LeaseStatus::Active,
            'signed_at' => $at,
        ]);
    }

    private function visit(User $agent, VisitStatus $status, string $at): void
    {
        PropertyVisit::factory()->create([
            'property_id' => $this->property->id,
            'agent_id' => $agent->id,
            'status' => $status,
            'scheduled_at' => $at,
        ]);
    }

    private function url(?Agency $agency = null): string
    {
        return '/api/agencies/'.($agency ?? $this->agency)->id.'/team-performance?period=2026-07';
    }

    /** @return array<int, array<string, mixed>> */
    private function rows(): array
    {
        return collect($this->getJson($this->url())->assertOk()->json('data.agents'))->keyBy('user_id')->all();
    }

    public function test_ac17_one_line_per_active_agent_over_the_period(): void
    {
        $a = $this->agencyAgent($this->agency);
        $b = $this->agencyAgent($this->agency);
        $this->signed($a, '2026-07-03 10:00:00');
        $this->signed($a, '2026-07-18 10:00:00');
        $this->signed($a, '2026-06-28 10:00:00');
        foreach (['2026-07-02', '2026-07-09', '2026-07-16'] as $day) {
            $this->visit($a, VisitStatus::Completed, "{$day} 10:00:00");
        }
        $this->visit($a, VisitStatus::Cancelled, '2026-07-10 10:00:00');
        $this->visit($b, VisitStatus::Completed, '2026-07-11 10:00:00');

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $rows = $this->rows();

        $this->assertSame('2026-07', $this->getJson($this->url())->json('data.period'));
        $this->assertSame(2, $rows[$a->id]['leases_signed']);
        $this->assertSame(3, $rows[$a->id]['visits_completed']);
        $this->assertSame(0, $rows[$b->id]['leases_signed']);
        $this->assertSame(1, $rows[$b->id]['visits_completed']);
    }

    public function test_ac17_the_query_count_does_not_depend_on_the_team_size(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        foreach (range(1, 2) as $_) {
            $this->signed($this->agencyAgent($this->agency), '2026-07-03 10:00:00');
        }
        $this->actingAsApi($admin);
        $this->getJson($this->url())->assertOk();

        $count = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson($this->url())->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };
        $two = $count();
        foreach (range(1, 4) as $_) {
            $this->signed($this->agencyAgent($this->agency), '2026-07-03 10:00:00');
        }
        $six = $count();

        $this->assertCount(6, $this->getJson($this->url())->json('data.agents'));
        $this->assertSame($two, $six, "2 agents : {$two}, 6 agents : {$six}");
    }

    public function test_ac17_an_individual_agency_is_refused(): void
    {
        $host = Agency::factory()->create(['kind' => AgencyKind::Individual]);

        $this->actingAsApi($this->agencyAdmin($host))->getJson($this->url($host))->assertForbidden();
    }

    public function test_ac17_an_agent_is_refused(): void
    {
        $this->actingAsApi($this->agencyAgent($this->agency))->getJson($this->url())->assertForbidden();
    }

    public function test_ac17_the_admin_of_another_agency_is_refused(): void
    {
        $this->actingAsApi($this->agencyAdmin(Agency::factory()->create()))->getJson($this->url())->assertForbidden();
    }

    public function test_ac17_the_system_agency_admin_reads_it_without_any_capability_added(): void
    {
        $this->actingAsApi($this->agencyAdmin($this->agency))->getJson($this->url())->assertOk();
    }
}
