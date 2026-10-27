<?php

namespace App\Jobs\Ai;

use App\Jobs\Concerns\RunsOnLongQueue;
use App\Models\AiEvaluationRun;
use App\Models\Enums\AiEvaluationStatus;
use App\Services\Ai\AiErrorCode;
use App\Services\Ai\AiUsageRegistry;
use App\Services\Ai\Evaluation\EvaluationRunner;
use App\Services\Ai\ModelLink;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * TCK-2385 — joue l'évaluation d'un candidat sur chaque usage de son rôle qui a un jeu de cas.
 * Idempotent : une évaluation qui n'est plus `queued` n'est pas rejouée (un second passage du même
 * job ne rappelle pas les modèles). Un échec se lit dans `error_code` (un code `ai.*`, `AiErrorCode`) ; une reprise de la file n'est jamais rejouée.
 *
 * Toute écriture d'état est CONDITIONNELLE à l'état attendu : un état terminal n'est jamais réécrit,
 * ni par `failed()` (appelé par le worker quand le job est tué ou repris), ni par le verdict tardif
 * d'un worker que la file avait déjà déclaré échoué.
 */
class RunAiEvaluation implements ShouldQueue
{
    use Queueable, RunsOnLongQueue;

    /** Source unique du délai d'une évaluation : `AiEvaluationRun::STALE_AFTER_SECONDS` en dérive. */
    public const TIMEOUT_SECONDS = 1800;

    /**
     * TCK-2397 (ADR-0078) — le job passe par `database-long` / `long` ({@see RunsOnLongQueue}), servie par
     * le seul `worker-long`, dont le `retry_after` (1900 s) dépasse `TIMEOUT_SECONDS`. Un job vivant n'est
     * donc jamais relivré à lui-même. Les vrais cas de mort sont deux :
     *  - un dépassement de `$timeout` passe par `$failOnTimeout` puis `failed()` ;
     *  - un SIGKILL (mémoire, redémarrage de déploiement) laisse la ligne `jobs` réservée ; la file la
     *    relivre après `retry_after`, et avec `$tries = 1` cette relivraison échoue aussitôt
     *    (`MaxAttemptsExceededException` → `failed()` → `Failed`). Avec `$tries = 3`, l'évaluation
     *    resterait `running` jusqu'à `STALE_AFTER_SECONDS` (2100 s) sans `failed()`.
     * Un échec réel ne se rejoue pas : `handle()` attrape tout. `markLostIfStale()` reste le filet de
     * dernier recours. `scripts/check-queues.mjs` rougit si `TIMEOUT_SECONDS` rattrape le délai de reprise.
     */
    public int $tries = 1;

    /** Le worker du Compose tourne sans `--timeout` : ce délai prévaut. */
    public int $timeout = self::TIMEOUT_SECONDS;

    /** Un dépassement de `$timeout` échoue le job (donc `failed()`), il ne le remet pas en file. */
    public bool $failOnTimeout = true;

    public function __construct(public readonly int $runId)
    {
        $this->onLongQueue();
    }

    public function handle(EvaluationRunner $runner, AiUsageRegistry $registry): void
    {
        $run = AiEvaluationRun::query()->findOrFail($this->runId);
        // Départ atomique : `Queued → Running` en une seule mise à jour conditionnelle. Une lecture puis un
        // `save()` laissaient deux exécutions simultanées lire `queued` toutes deux et appeler deux fois le modèle.
        $partis = AiEvaluationRun::query()->whereKey($run->getKey())
            ->where('status', AiEvaluationStatus::Queued->value)
            ->update(['status' => AiEvaluationStatus::Running->value, 'started_at' => now(), 'updated_at' => now()]);
        if ($partis !== 1) {
            return;
        }
        $run->refresh();

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
                'status' => AiEvaluationStatus::Failed, 'error_code' => AiErrorCode::fromThrowable($e), 'finished_at' => now(),
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
            'error_code' => $e === null ? 'ai.eval.job_failed' : AiErrorCode::fromThrowable($e),
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
