<?php

namespace App\Jobs\Concerns;

use App\Support\Logging\SafeExceptionContext;
use Throwable;

/**
 * TCK-772 (P14.04) — un job d'argent ou de bail planifié par `Schedule::job` n'est que mis en file :
 * `scheduled_task_runs` le voit `finished` même quand il échoue ensuite chez le worker, et
 * `ops_failed_jobs_spike` n'alerte qu'à 20 échecs par heure. Un échec par nuit ne prévenait
 * personne.
 *
 * Le worker appelle `failed()` quand le job a épuisé ses tentatives : l'activité `ops_critical_job_failed`
 * (alertable, `AlertableEvents`) part alors dès le premier échec. Le message de l'exception n'y
 * entre jamais (ADR-0044 § 2) : la classe et le point de levée seulement.
 */
trait AlertsOnFirstFailure
{
    public function failed(?Throwable $e): void
    {
        $context = $e !== null ? SafeExceptionContext::of($e) : [];

        activity('Ops')
            ->event('ops_critical_job_failed')
            ->withProperties([
                'job' => class_basename(static::class),
                'exception' => $context['exception'] ?? null,
                'at' => $context['at'] ?? null,
            ])
            ->log('ops_critical_job_failed');
    }
}
