<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Customer;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\TaskStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyVisit;
use App\Models\Task;
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

    /**
     * P93.07 (TCK-1179) — les quatre indicateurs que rien n'assertait, chacun sur une valeur non
     * nulle et distincte des autres, avec un intrus par règle (hors période, autre agence, autre
     * statut ou rôle).
     */
    public function test_p93_07_sales_customers_commissions_and_managed_properties_have_their_value(): void
    {
        $a = $this->agencyAgent($this->agency);
        $other = Agency::factory()->create();

        // Ventes signées : 1 (un bail résidentiel et une vente de juin n'en sont pas).
        $lease = fn (LeaseType $type, string $at): Lease => Lease::factory()->create([
            'property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'agent_id' => $a->id,
            'status' => LeaseStatus::Active, 'type' => $type, 'signed_at' => $at,
        ]);
        $lease(LeaseType::Sale, '2026-07-04 10:00:00');
        $lease(LeaseType::ResidentialRent, '2026-07-05 10:00:00');
        $lease(LeaseType::Sale, '2026-06-20 10:00:00');

        // Clients ajoutés : 3 (juin et une autre agence n'en sont pas).
        $customer = fn (int $agencyId, string $at) => Customer::factory()->create([
            'agency_id' => $agencyId, 'added_by_id' => $a->id, 'created_at' => $at,
        ]);
        foreach (['2026-07-01', '2026-07-08', '2026-07-15'] as $day) {
            $customer($this->agency->id, "{$day} 09:00:00");
        }
        $customer($this->agency->id, '2026-06-30 09:00:00');
        $customer($other->id, '2026-07-08 09:00:00');

        // Commissions gagnées : 55 000 (une annulée et une de juin n'en sont pas).
        $commission = fn (float $amount, CommissionEntryStatus $status, string $at) => CommissionEntry::factory()->create([
            'agency_id' => $this->agency->id, 'beneficiary_id' => $a->id,
            // Une commission par (bail, bénéficiaire) : chacune sur un bail sans agent, hors des ventes.
            'lease_id' => Lease::factory()->create(['property_id' => $this->property->id, 'agency_id' => $this->agency->id, 'agent_id' => null])->id,
            'amount' => $amount, 'status' => $status, 'earned_at' => $at,
        ]);
        $commission(30_000, CommissionEntryStatus::Due, '2026-07-04 10:00:00');
        $commission(25_000, CommissionEntryStatus::Paid, '2026-07-12 10:00:00');
        $commission(70_000, CommissionEntryStatus::Cancelled, '2026-07-12 10:00:00');
        $commission(90_000, CommissionEntryStatus::Due, '2026-06-12 10:00:00');

        // Biens gérés : 4 — deux possédés, deux en collaboration `agent` ou `manager` ; le bien
        // possédé ET collaboré ne compte qu'une fois, `viewer` et l'autre agence ne comptent pas.
        $owned = Property::factory()->count(2)->create(['agency_id' => $this->agency->id, 'user_id' => $a->id]);
        $collab = fn (Property $p, CollaboratorRole $role) => PropertyCollaborator::query()->create([
            'property_id' => $p->id, 'user_id' => $a->id, 'role' => $role,
        ]);
        $collab(Property::factory()->create(['agency_id' => $this->agency->id]), CollaboratorRole::Agent);
        $collab(Property::factory()->create(['agency_id' => $this->agency->id]), CollaboratorRole::Manager);
        $collab($owned[0], CollaboratorRole::Agent);
        $collab(Property::factory()->create(['agency_id' => $this->agency->id]), CollaboratorRole::Viewer);
        $collab(Property::factory()->create(['agency_id' => $other->id]), CollaboratorRole::Agent);
        Property::factory()->create(['agency_id' => $other->id, 'user_id' => $a->id]);

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $row = $this->rows()[$a->id];

        $this->assertSame(1, $row['sales_signed']);
        $this->assertSame(1, $row['leases_signed']);
        $this->assertSame(3, $row['customers_added']);
        $this->assertEquals(55000, $row['commissions_earned']);
        $this->assertSame(4, $row['properties_managed']);
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

    /**
     * verif-595 m3 — `tasks_overdue` ne compte que les tâches dont le parent est dans l'agence : un
     * agent présent dans deux agences y lisait les retards de l'autre.
     */
    public function test_m3_overdue_tasks_are_bounded_to_the_agency(): void
    {
        $a = $this->agencyAgent($this->agency);
        $other = Agency::factory()->create();
        $elsewhere = Property::factory()->create(['agency_id' => $other->id]);
        $here = Customer::factory()->create(['agency_id' => $this->agency->id]);
        $overdue = ['assigned_to_id' => $a->id, 'status' => TaskStatus::Open, 'due_at' => now()->subDays(3)];
        Task::factory()->count(3)->create($overdue + ['taskable_type' => $elsewhere->getMorphClass(), 'taskable_id' => $elsewhere->id]);
        Task::factory()->create($overdue + ['taskable_type' => $this->property->getMorphClass(), 'taskable_id' => $this->property->id]);
        Task::factory()->create($overdue + ['taskable_type' => $here->getMorphClass(), 'taskable_id' => $here->id]);
        Task::factory()->create($overdue + ['taskable_type' => null, 'taskable_id' => null]);

        $this->actingAsApi($this->agencyAdmin($this->agency));
        $this->assertSame(2, $this->rows()[$a->id]['tasks_overdue']);
    }
}
