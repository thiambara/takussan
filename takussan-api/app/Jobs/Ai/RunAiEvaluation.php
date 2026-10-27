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
 */
class RunAiEvaluation implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 1800;

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
            $run->forceFill([
                'status' => AiEvaluationStatus::Done, 'report' => ['usages' => $reports],
                'below_baseline' => $below, 'finished_at' => now(),
            ])->save();
        } catch (Throwable $e) {
            $run->forceFill(['status' => AiEvaluationStatus::Failed, 'error_code' => class_basename($e), 'finished_at' => now()])->save();
        }
    }
}
