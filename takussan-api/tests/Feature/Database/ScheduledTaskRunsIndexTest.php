<?php

namespace Tests\Feature\Database;

use App\Models\Enums\ScheduledTaskRunStatus;
use App\Models\ScheduledTaskRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * TCK-802 (P02.11) — la dernière exécution d'une tâche se lit par un index, sans tri.
 *
 * `ScheduledTaskInspector` lit, pour chaque tâche, la dernière exécution
 * (`where task = ? order by last_run_at desc, id desc limit 1`). Avec le seul index `task`, le moteur
 * relit toutes les exécutions de la tâche puis les trie ; la table prend une ligne par exécution.
 */
class ScheduledTaskRunsIndexTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_index_covers_task_then_latest_run(): void
    {
        $index = collect(Schema::getIndexes('scheduled_task_runs'))
            ->firstWhere('name', 'scheduled_task_runs_task_last_run_idx');

        $this->assertNotNull($index, 'index (task, last_run_at desc, id desc) absent');
        $this->assertSame(['task', 'last_run_at', 'id'], $index['columns']);
    }

    public function test_the_latest_run_of_a_task_is_read_without_a_sort(): void
    {
        foreach (range(1, 50) as $i) {
            ScheduledTaskRun::query()->create([
                'task' => $i % 2 ? 'health:probe' : 'alerts:evaluate',
                'last_run_at' => now()->subMinutes($i),
                'duration_ms' => 10,
                'status' => ScheduledTaskRunStatus::Finished,
            ]);
        }

        // La table de test est minuscule : sans cela, le moteur la balaierait quel que soit l'index.
        DB::statement('SET LOCAL enable_seqscan = off');
        $plan = collect(DB::select(
            "EXPLAIN select status from scheduled_task_runs where task = 'health:probe' order by last_run_at desc, id desc limit 1"
        ))->pluck('QUERY PLAN')->implode("\n");

        $this->assertStringContainsString('scheduled_task_runs_task_last_run_idx', $plan);
        $this->assertStringNotContainsString('Sort', $plan);
    }
}
