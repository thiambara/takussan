<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2626 — AC4 : les demandes traitées par agent, à côté des visites et des baux. Une demande
 * compte pour l'agent qui l'a traitée (`handled_by_id`), au mois de `handled_at`, dans l'agence.
 */
class TeamPerformanceLeadsHandledTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-20 10:00:00');
        $this->agency = Agency::factory()->create();
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id]);
    }

    private function handled(User $agent, string $at, ?Property $property = null): void
    {
        PropertyContactLead::factory()->create([
            'property_id' => ($property ?? $this->property)->id,
            'handled_by_id' => $agent->id,
            'handled_at' => $at,
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    private function rows(string $period = '2026-11'): array
    {
        return collect($this->getJson("/api/agencies/{$this->agency->id}/team-performance?period={$period}")
            ->assertOk()->json('data.agents'))->keyBy('user_id')->all();
    }

    public function test_ac4_three_handled_in_november_and_one_in_october_give_three(): void
    {
        $a = $this->agencyAgent($this->agency);
        $b = $this->agencyAgent($this->agency);
        $this->handled($a, '2026-11-02 09:00:00');
        $this->handled($a, '2026-11-10 15:30:00');
        $this->handled($a, '2026-11-19 18:00:00');
        $this->handled($a, '2026-10-28 11:00:00');
        $this->handled($b, '2026-11-05 10:00:00');
        PropertyContactLead::factory()->create(['property_id' => $this->property->id, 'handled_by_id' => null, 'handled_at' => null]);

        $this->actingAsApi($this->agencyAdmin($this->agency));

        $this->assertSame(3, $this->rows()[$a->id]['leads_handled']);
        $this->assertSame(1, $this->rows()[$b->id]['leads_handled']);
        $this->assertSame(1, $this->rows('2026-10')[$a->id]['leads_handled']);
    }

    public function test_the_month_bounds_are_inclusive_of_the_last_second_only(): void
    {
        $a = $this->agencyAgent($this->agency);
        $this->handled($a, '2026-10-31 23:59:59');
        $this->handled($a, '2026-11-01 00:00:00');
        $this->handled($a, '2026-11-30 23:59:59');
        $this->handled($a, '2026-12-01 00:00:00');

        $this->actingAsApi($this->agencyAdmin($this->agency));

        $this->assertSame(2, $this->rows()[$a->id]['leads_handled']);
    }

    public function test_a_lead_of_another_agency_handled_by_the_same_agent_does_not_count(): void
    {
        $a = $this->agencyAgent($this->agency);
        $elsewhere = Property::factory()->create(['agency_id' => Agency::factory()->create()->id]);
        $this->handled($a, '2026-11-03 10:00:00');
        $this->handled($a, '2026-11-04 10:00:00', $elsewhere);

        $this->actingAsApi($this->agencyAdmin($this->agency));

        $this->assertSame(1, $this->rows()[$a->id]['leads_handled']);
    }

    public function test_an_agent_without_any_handled_lead_reads_zero_and_the_count_is_one_query(): void
    {
        $agents = [$this->agencyAgent($this->agency), $this->agencyAgent($this->agency)];
        $this->handled($agents[0], '2026-11-03 10:00:00');
        $this->actingAsApi($this->agencyAdmin($this->agency));
        $this->rows();

        $count = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->rows();
            $n = collect(DB::getQueryLog())->filter(fn (array $q): bool => str_contains($q['query'], 'property_contact_leads'))->count();
            DB::disableQueryLog();

            return $n;
        };

        $this->assertSame(0, $this->rows()[$agents[1]->id]['leads_handled']);
        $this->assertSame(1, $count());
        foreach (range(1, 3) as $_) {
            $this->handled($this->agencyAgent($this->agency), '2026-11-04 10:00:00');
        }
        $this->assertSame(1, $count());
    }
}
