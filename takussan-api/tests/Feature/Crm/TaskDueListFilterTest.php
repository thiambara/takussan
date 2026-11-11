<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\TaskStatus;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\ApiTestCase;

/**
 * TCK-2595 — `filter[due]` en liste séparée par des virgules : l'union des périodes, pour la
 * journée de l'agent en une requête. Le tableau (`filter[due][]=`) reste une valeur absente.
 */
class TaskDueListFilterTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @var array<string, Task> */
    private array $tasks = [];

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-10-07 10:00:00', Task::DUE_TIMEZONE));

        $agency = Agency::factory()->create();
        $this->agent = User::factory()->create();
        $this->materializeRoleProfile($this->agent, 'agent', $agency);
        $customer = Customer::factory()->create(['agency_id' => $agency->id, 'added_by_id' => $this->agent->id]);

        $make = fn (?string $due, TaskStatus $status = TaskStatus::Open) => Task::factory()->forCustomer($customer)->create([
            'created_by_id' => $this->agent->id,
            'assigned_to_id' => $this->agent->id,
            'due_at' => $due === null ? null : Carbon::parse($due, Task::DUE_TIMEZONE),
            'status' => $status,
        ]);

        $this->tasks = [
            'yesterday_open' => $make('2026-10-06 09:00'),
            'yesterday_done' => $make('2026-10-06 09:00', TaskStatus::Done),
            'today' => $make('2026-10-07 18:00'),
            'today_done' => $make('2026-10-07 08:00', TaskStatus::Done),
            'tomorrow' => $make('2026-10-08 08:00'),
            'none' => $make(null),
        ];
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /** @return list<int> */
    private function ids(string $query): array
    {
        return collect($this->actingAsApi($this->agent)->apiGet('/api/tasks?'.$query)->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();
    }

    /** @return list<int> */
    private function of(string ...$keys): array
    {
        return collect($keys)->map(fn (string $k) => $this->tasks[$k]->id)->sort()->values()->all();
    }

    /** AC2 (R) — en retard ET du jour, pas demain ; la tâche d'hier faite n'est pas en retard. */
    public function test_ac2_overdue_et_today(): void
    {
        $this->assertSame($this->of('yesterday_open', 'today', 'today_done'), $this->ids('filter[due]=overdue,today'));
        $this->assertSame($this->of('yesterday_open', 'today', 'today_done'), $this->ids('filter[due]=today,%20overdue'));
    }

    public function test_les_valeurs_seules_ne_changent_pas(): void
    {
        $this->assertSame($this->of('yesterday_open'), $this->ids('filter[due]=overdue'));
        $this->assertSame($this->of('today', 'today_done'), $this->ids('filter[due]=today'));
        $this->assertSame($this->of('tomorrow', 'none'), $this->ids('filter[due]=upcoming,none'));
    }

    /** Une valeur inconnue dans la liste ne rend rien d'elle ; seule, rien du tout. Un tableau : rien. */
    public function test_inconnu_et_tableau(): void
    {
        $this->assertSame($this->of('today', 'today_done'), $this->ids('filter[due]=today,someday'));
        $this->assertSame([], $this->ids('filter[due]=someday'));
        $this->assertSame([], $this->ids('filter[due]=,'));
        $this->assertSame([], $this->ids('filter[due][]=today&filter[due][]=overdue'));
    }

    /** La liste se combine aux autres filtres en ET. */
    public function test_combinee_a_un_autre_filtre(): void
    {
        $this->assertSame($this->of('today_done'), $this->ids('filter[due]=overdue,today&filter[status]=done'));
    }
}
