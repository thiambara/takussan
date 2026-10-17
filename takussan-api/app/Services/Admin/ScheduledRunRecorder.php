<?php

namespace App\Services\Admin;

use App\Models\Enums\ScheduledTaskRunStatus;
use App\Models\ScheduledTaskRun;
use Illuminate\Console\Scheduling\Event;

/**
 * TCK-383 — l'écrivain UNIQUE de `scheduled_task_runs`, et le seul endroit qui sache qu'une même
 * exécution peut être décrite par DEUX événements du framework.
 *
 * `ScheduleRunCommand` dispatche `ScheduledTaskFinished` **puis** lève l'exception du code de sortie,
 * qu'il rattrape et convertit en `ScheduledTaskFailed` (`ScheduleRunCommand:207-218`). Une tâche qui
 * sort en code non nul passe donc par les deux écouteurs. Deux `create()` rendraient deux lignes pour
 * une seule exécution — un compte faux, sur une table qui n'a pas d'autre juge.
 *
 * La clé de déduplication est `spl_object_id($task)` : c'est le MÊME objet `Event` que le framework
 * passe aux deux événements, dans le même processus. Elle ne franchit ni le processus ni le tick, ce
 * qui est exactement la portée voulue — deux exécutions successives de la même tâche doivent rendre
 * deux lignes.
 *
 * ⚠ Ce service DOIT être un singleton (`AppServiceProvider::register`) : le conteneur résout un
 * écouteur à chaque dispatch, et un registre porté par une instance jetable ne déduplique rien.
 */
class ScheduledRunRecorder
{
    /** @var array<int, ScheduledTaskRun> spl_object_id($task) => la ligne déjà écrite pour CETTE exécution */
    private array $lignes = [];

    /**
     * @param  float|null  $runtimeSeconds  Durée en SECONDES telle que le framework la mesure
     *                                      (`ScheduledTaskFinished::$runtime`, déjà arrondie au
     *                                      centième). `null` = non mesurée, et non « zéro ».
     */
    public function record(Event $task, ScheduledTaskRunStatus $status, ?float $runtimeSeconds = null): ScheduledTaskRun
    {
        $durationMs = $runtimeSeconds === null ? null : max(0, (int) round($runtimeSeconds * 1000));
        $cle = spl_object_id($task);

        if (isset($this->lignes[$cle])) {
            $ligne = $this->lignes[$cle];
            $ligne->status = $status;

            // Une durée déjà mesurée ne se fait pas écraser par une absence de mesure :
            // `ScheduledTaskFailed` ne porte pas de durée, et il arrive APRÈS `ScheduledTaskFinished`.
            if ($durationMs !== null) {
                $ligne->duration_ms = $durationMs;
            }

            $ligne->save();

            return $ligne;
        }

        return $this->lignes[$cle] = ScheduledTaskRun::query()->create([
            'task' => self::nomDe($task),
            'last_run_at' => now(),
            'duration_ms' => $durationMs,
            'status' => $status,
        ]);
    }

    /**
     * Le préfixe que `Schedule::command()` pose devant une commande Artisan : le binaire PHP puis
     * `artisan`, chacun échappé (`Application::formatCommandString`), quel que soit leur chemin.
     */
    private const PREFIXE_ARTISAN = '/^(?:\'[^\']*\'|"[^"]*"|\S+)\s+(?:\'[^\']*artisan\'|"[^"]*artisan"|\S*artisan)\s+/';

    /**
     * Nom lisible de la tâche — `description` (posée par `->name()`) puis la commande.
     *
     * Une fermeture planifiée sans nom n'a NI l'une NI l'autre : le repli garde alors la ligne
     * insérable plutôt que de lever sur une colonne non nullable.
     *
     * TCK-801 (P19.05) — une commande Artisan est nommée SANS le binaire PHP qui la lance
     * (`health:probe`, et non `'/opt/…/8.4.6/bin/php' 'artisan' health:probe`) : changer de version
     * de PHP ou d'image coupait l'historique d'une tâche en deux noms.
     */
    public static function nomDe(Event $task): string
    {
        if ($task->description) {
            return $task->description;
        }

        if (! $task->command) {
            return 'scheduled-task';
        }

        return preg_replace(self::PREFIXE_ARTISAN, '', $task->command) ?: $task->command;
    }
}
