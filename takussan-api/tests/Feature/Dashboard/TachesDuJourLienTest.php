<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\TaskStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * TCK-1733 (P167.04) — « Tâches du jour » compte les tâches ASSIGNÉES à l'agent dans l'agence
 * active ; le lien de la tuile ouvre `/api/tasks?filter[due]=today&filter[assigned_to]=me`, qui
 * rend cette portée : ni les tâches qu'il a créées pour un autre, ni celles d'une autre agence. Les
 * tâches closes du jour restent dans la liste (TCK-591) : le compte ne les dit pas, la liste si.
 */
class TachesDuJourLienTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_the_tile_count_matches_the_list_its_link_opens(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-07 10:00:00', Task::DUE_TIMEZONE));
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $agent = $this->apiActingAsRole('agent', ['agency' => $agencyA]);
        $this->materializeRoleProfile($agent, 'agent', $agencyB);
        $profileA = AgentProfile::query()->where('user_id', $agent->id)->where('agency_id', $agencyA->id)->firstOrFail();
        $this->withHeaders(['X-Profile-Id' => "agent:{$profileA->id}"]);
        $colleague = User::factory()->create();
        $this->materializeRoleProfile($colleague, 'agent', $agencyA);

        $customerA = Customer::factory()->create(['agency_id' => $agencyA->id]);
        $customerB = Customer::factory()->create(['agency_id' => $agencyB->id]);
        $make = fn (Customer $c, User $assignee, TaskStatus $status = TaskStatus::Open) => Task::factory()->forCustomer($c)->create([
            'created_by_id' => $agent->id,
            'assigned_to_id' => $assignee->id,
            'due_at' => Carbon::parse('2026-10-07 18:00', Task::DUE_TIMEZONE),
            'status' => $status,
        ]);

        $mine = $make($customerA, $agent);
        $mineDone = $make($customerA, $agent, TaskStatus::Done);
        $make($customerA, $colleague);
        $make($customerB, $agent);

        $tile = $this->apiGet('/api/dashboard/agent')->assertOk()->json('data.pipeline_ops.tasks_today');
        $this->assertSame(1, $tile);

        $rows = $this->apiGet('/api/tasks?filter[due]=today&filter[assigned_to]=me')->assertOk()->json('data');

        $this->assertEqualsCanonicalizing([$mine->id, $mineDone->id], array_column($rows, 'id'));
        $open = array_filter($rows, fn (array $r) => in_array($r['status'], ['open', 'in_progress'], true));
        $this->assertCount($tile, $open);
    }

    public function test_an_unknown_value_returns_nothing(): void
    {
        $agent = $this->apiActingAsRole('agent', ['agency' => Agency::factory()->create()]);
        Task::factory()->create(['created_by_id' => $agent->id, 'assigned_to_id' => $agent->id]);

        $this->apiGet('/api/tasks?filter[assigned_to]=someone')->assertOk()->assertJsonCount(0, 'data');
        $this->apiGet('/api/tasks?filter[assigned_to][]=me')->assertOk()->assertJsonCount(0, 'data');
    }
}
