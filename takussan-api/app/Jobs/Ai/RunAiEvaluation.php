<?php

namespace App\Jobs\Ai;

use App\Models\AiEvaluationRun;
use App\Models\Enums\AiEvaluationStatus;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\ModelLink;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * TCK-2385 — joue l'évaluation d'un candidat sur chaque usage de son rôle qui a un jeu de cas.
 * Idempotent : une évaluation qui n'est plus `queued` n'est pas rejouée (un second passage du même
 * job ne rappelle pas les modèles). Une seule tentative : un échec se lit dans `error_code`.
 *
 * Toute écriture d'état est CONDITIONNELLE à l'état attendu : un état terminal n'est jamais réécrit,
 * ni par `failed()` (appelé par le worker quand le job est tué ou repris), ni par le verdict tardif
 * d'un worker que la file avait déjà déclaré échoué.
 */
class RunAiEvaluation implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    /**
     * ⚠ Mesuré (2026-10-27) : `QUEUE_CONNECTION=database`, `DB_QUEUE_RETRY_AFTER` non posée, donc
     * `retry_after` = 90 s (`config/queue.php`, docs/infra/hebergement.md) ; le `worker` du Compose
     * tourne sans `--timeout` (le `$timeout` du job prévaut). Une évaluation de plus de 90 s est donc
     * reprise par la file avec `attempts` = 2 > `$tries` : le worker la déclare échouée
     * (`MaxAttemptsExceededException` → `failed()`) sans rejouer `handle()`. Les écritures
     * conditionnelles font que ce verdict d'échec tient et que le worker d'origine ne le défait pas.
     * Un `$timeout` > `retry_after` n'a d'effet que si `retry_after` est relevé au-dessus de lui.
     */
    public int $timeout = 1800;

    /** Un dépassement de `$timeout` échoue le job (donc `failed()`), il ne le remet pas en file. */
    public bool $failOnTimeout = true;

    public function __construct(public readonly int $runId) {}

    public function handle(EvaluationRunner $runner, AiUsageRegistry $registry): void
    {
        $run = AiEvaluationRun::query()->findOrFail($this->runId);
        if ($run->status !== AiEvaluationStatus::Queued) {
            return;
        }
        $run->forceFill(['status' => AiEvaluationStatus::Running, 'started_at' => now()])->save();

        try {
            $link = ModelLink::fromArray($run->candidate);
            $reports = [];
            $below = false;
            foreach ($registry->forRole($run->role) as $usage) {
                if ($runner->cases($usage->key()) === []) {
                    continue;
                }
                $report = $runner->run($usage->key(), $link);
                $baseline = $runner->baseline($usage->key());
                $report['baseline'] = $baseline;
                // Le verdict, pas la seule comparaison : un candidat dont des appels ont échoué (panne) ou
                // dont les champs ne sont plus ceux de la référence ne passe jamais le cliquet.
                $report['verdict'] = $runner->verdict($report, $baseline);
                $report['below_baseline'] = $report['verdict'] !== null;
                $below = $below || $report['below_baseline'];
                $reports[$usage->key()] = $report;
            }
            $this->leave($run, [
                'status' => AiEvaluationStatus::Done, 'report' => ['usages' => $reports],
                'below_baseline' => $below, 'finished_at' => now(),
            ], [AiEvaluationStatus::Running]);
        } catch (Throwable $e) {
            report($e);
            $this->leave($run, [
                'status' => AiEvaluationStatus::Failed, 'error_code' => class_basename($e), 'finished_at' => now(),
            ], [AiEvaluationStatus::Running]);
        }
    }

    /**
     * Appelé par le worker quand le job meurt avant son `catch` (délai dépassé, mémoire, redémarrage)
     * ou est repris après `retry_after`. Sans lui, l'évaluation restait `running` pour toujours.
     * Précédent : `GenerateReportExport::failed`, `ProcessDataExport::failed`.
     */
    public function failed(?Throwable $e): void
    {
        AiEvaluationRun::query()->whereKey($this->runId)->whereIn('status', [AiEvaluationStatus::Queued->value, AiEvaluationStatus::Running->value])->update([
            'status' => AiEvaluationStatus::Failed->value,
            'error_code' => $e === null ? 'ai.eval.job_failed' : class_basename($e),
            'finished_at' => now(),
        ]);
    }

    /**
     * Écrit l'issue SEULEMENT si l'évaluation est encore dans l'un des états attendus : une mise à jour
     * conditionnelle en base, pas un `save()` du modèle lu au début (qui réécrirait un état terminal).
     *
     * @param  array<string, mixed>  $attributes
     * @param  list<AiEvaluationStatus>  $from
     */
    private function leave(AiEvaluationRun $run, array $attributes, array $from): void
    {
        $run->newQuery()->whereKey($run->getKey())
            ->whereIn('status', array_map(fn (AiEvaluationStatus $s): string => $s->value, $from))
            ->update($this->castForUpdate($run, $attributes));
    }

    /**
     * `Builder::update()` ne passe pas par les casts du modèle : enums et tableaux sont encodés ici.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function castForUpdate(AiEvaluationRun $run, array $attributes): array
    {
        $tmp = (new AiEvaluationRun)->forceFill($attributes);

        return array_intersect_key($tmp->getAttributes(), $attributes) + ['updated_at' => now()];
    }
}
