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
 * TCK-591 AC7 — `filter[due]` sur un jeu fixé : une tâche d'hier ouverte, une d'hier terminée, une
 * d'aujourd'hui, une de demain, une sans échéance.
 */
class TaskDueFilterTest extends ApiTestCase
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
        $customer = Customer::factory()->create([
            'agency_id' => $agency->id,
            'added_by_id' => $this->agent->id,
            'first_name' => 'Awa',
            'last_name' => 'Diop',
        ]);

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
    private function ids(string $due): array
    {
        $rows = $this->actingAsApi($this->agent)
            ->apiGet('/api/tasks?filter[due]='.$due)
            ->assertOk()
            ->json('data');

        foreach ($rows as $row) {
            $this->assertSame('Awa Diop', $row['taskable']['label']);
        }

        return collect($rows)->pluck('id')->sort()->values()->all();
    }

    public function test_overdue_keeps_only_the_open_task_of_yesterday(): void
    {
        $this->assertSame([$this->tasks['yesterday_open']->id], $this->ids('overdue'));
    }

    public function test_today_upcoming_and_none(): void
    {
        $this->assertSame([$this->tasks['today']->id], $this->ids('today'));
        $this->assertSame([$this->tasks['tomorrow']->id], $this->ids('upcoming'));
        $this->assertSame([$this->tasks['none']->id], $this->ids('none'));
    }

    public function test_an_unknown_value_returns_nothing(): void
    {
        $this->assertSame([], $this->ids('someday'));
    }
}
