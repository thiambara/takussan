<?php

namespace App\Jobs\Concerns;

/**
 * TCK-2397 (ADR-0078) — un job dont le `$timeout` dépasse le délai de reprise de `database` (90 s)
 * passe par `database-long` / `long`, servi par le seul `worker-long`.
 *
 * À appeler dans le constructeur : un trait n'a pas d'autre point d'entrée, et `Schedule::job()`
 * comme `dispatch()` lisent `$connection` et `$queue` sur l'instance. Hors de `database` (`sync` de
 * la suite, `redis`), la connexion par défaut est gardée : la suite exécute ces jobs sur place.
 */
trait RunsOnLongQueue
{
    protected function onLongQueue(): void
    {
        $default = config('queue.default');

        $this->onConnection($default === 'database' ? 'database-long' : $default);
        $this->onQueue('long');
    }
}
