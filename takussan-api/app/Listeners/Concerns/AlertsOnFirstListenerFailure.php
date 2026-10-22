<?php

namespace App\Listeners\Concerns;

use App\Jobs\Concerns\AlertsOnFirstFailure;
use App\Support\Logging\SafeExceptionContext;
use Throwable;

/**
 * TCK-1392 (P142.04) — le pendant de {@see AlertsOnFirstFailure} pour un écouteur en file.
 *
 * Le trait des jobs ne s'emploie pas tel quel : le worker appelle `failed()` d'un écouteur avec
 * l'événement en premier argument (`CallQueuedListener::failed()`), puis l'exception. Le reste est
 * le même : un délai entre deux essais (le worker passe `--tries=3` sans `--backoff`), et
 * l'activité alertable `ops_critical_job_failed` dès le premier échec final, sans le message de
 * l'exception (ADR-0044 § 2).
 *
 * Pour les écouteurs dont l'effet n'a pas d'autre chemin : les lignes de commission d'un bail, sa
 * checklist d'entrée.
 */
trait AlertsOnFirstListenerFailure
{
    /** @return list<int> */
    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function failed(object $event, ?Throwable $e): void
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
