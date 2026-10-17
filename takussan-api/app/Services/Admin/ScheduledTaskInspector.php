<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\DB;

class ScheduledTaskInspector
{
    /** TCK-801 (P19.05) — la fenêtre de la durée moyenne affichée par la console. */
    public const FENETRE_MOYENNE_JOURS = 7;

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
                // TCK-801 (P19.05) — la moyenne des 7 derniers jours, et non de tout l'historique :
                // une régression récente se voit au lieu de se diluer.
                DB::raw('avg(duration_ms) filter (where last_run_at >= ?) as average_duration_ms'),
                DB::raw(self::DERNIER_STATUT),
            )
            ->addBinding(now()->subDays(self::FENETRE_MOYENNE_JOURS), 'select')
            ->groupBy('task')
            ->orderBy('task')
            ->get()
            ->map(fn ($run) => [
                'task' => $run->task,
                'last_run_at' => $run->last_run_at,
                'last_status' => $run->last_status,
                'next_due_at' => null,
                // `avg()` ignore les NULL : une tâche dont aucune exécution n'a été mesurée sur la
                // fenêtre rend `null` — « pas de mesure », qui n'est pas « zéro milliseconde ».
                'average_duration_ms' => $run->average_duration_ms !== null ? (int) $run->average_duration_ms : null,
            ])
            ->all();
    }
}
