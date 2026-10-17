<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * TCK-802 (P02.11) — la dernière exécution d'une tâche se lit par index, sans tri.
 *
 * `ScheduledTaskInspector` prend, pour chaque tâche, sa dernière exécution
 * (`where task = ? order by last_run_at desc, id desc limit 1`). Le seul index `task` obligeait à
 * relire toutes les exécutions de la tâche puis à les trier (mesuré par le mesureur : Seq Scan,
 * puis un Sort par tâche) ; la table prend une ligne par exécution. Ajout d'index seul, sans
 * réécriture de données ; l'index `task` existant reste.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('scheduled_task_runs', function (Blueprint $table): void {
            $table->rawIndex('task, last_run_at desc, id desc', 'scheduled_task_runs_task_last_run_idx');
        });
    }

    public function down(): void
    {
        Schema::table('scheduled_task_runs', function (Blueprint $table): void {
            $table->dropIndex('scheduled_task_runs_task_last_run_idx');
        });
    }
};
