<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\DB;

class ScheduledTaskInspector
{
    /**
     * Le statut de la DERNIÈRE exécution, par sous-requête corrélée.
     *
     * ⚠ Ce n'est pas un agrégat, et ça ne peut pas en être un : `max(status)` sur une chaîne rendrait
     * un ordre ALPHABÉTIQUE — `skipped` > `running` > `finished` > `failed` —, c'est-à-dire un statut
     * qui n'est celui d'aucune exécution. Le tri se fait sur `last_run_at`, avec `id` en départage :
     * deux exécutions d'un même tick partagent l'horodatage à la seconde près.
     */
    private const DERNIER_STATUT = <<<'SQL'
        (
            select derniere.status
            from scheduled_task_runs as derniere
            where derniere.task = scheduled_task_runs.task
            order by derniere.last_run_at desc, derniere.id desc
            limit 1
        ) as last_status
        SQL;

    public function all(): array
    {
        return DB::table('scheduled_task_runs')
            ->select(
                'task',
                DB::raw('max(last_run_at) as last_run_at'),
                DB::raw('avg(duration_ms) as average_duration_ms'),
                DB::raw(self::DERNIER_STATUT),
            )
            ->groupBy('task')
            ->orderBy('task')
            ->get()
            ->map(fn ($run) => [
                'task' => $run->task,
                'last_run_at' => $run->last_run_at,
                'last_status' => $run->last_status,
                'next_due_at' => null,
                // `avg()` ignore les NULL : une tâche dont aucune exécution n'a été mesurée rend
                // `null` — « pas de mesure », qui n'est pas la même chose que « zéro milliseconde ».
                'average_duration_ms' => $run->average_duration_ms !== null ? (int) $run->average_duration_ms : null,
            ])
            ->all();
    }
}
