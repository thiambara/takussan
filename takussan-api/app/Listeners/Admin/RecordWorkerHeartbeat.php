<?php

namespace App\Listeners\Admin;

use App\Jobs\RecordQueueHeartbeat;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\Looping;

/**
 * TCK-934 (P43.03) — la vie d'un worker se mesure HORS de la file qu'il consomme : chaque tour de
 * boucle du worker (`Looping`, avant de prendre un job ou de dormir) et chaque job dépilé
 * (`JobProcessed`) écrivent le battement de leurs files dans le cache.
 *
 * Le battement n'était qu'un job (`RecordQueueHeartbeat`) mis en file chaque minute sur la file
 * surveillée. Derrière un arriéré, il attendait son tour, et la sonde `workers` déclarait `failed`
 * à 300 s un worker occupé ; `worker-media` dépile `media` avant `reconciliation`, dont le
 * battement attendait donc tout l'arriéré de `media`. Le job planifié reste : il bat encore.
 *
 * Une exécution `sync` n'est pas un worker : elle n'écrit rien.
 *
 * ⚠ `handle()` ne rend RIEN : le worker dispatche `Looping` par `events->until()`, et un écouteur
 * qui rendrait `false` mettrait le worker en pause à chaque tour (`Worker::daemonShouldRun()`).
 */
class RecordWorkerHeartbeat
{
    public function handle(Looping $event): void
    {
        if ($event->connectionName === 'sync') {
            return;
        }

        foreach (explode(',', (string) $event->queue) as $queue) {
            RecordQueueHeartbeat::beat(trim($queue));
        }
    }

    public function handleJobProcessed(JobProcessed $event): void
    {
        if ($event->connectionName === 'sync') {
            return;
        }

        RecordQueueHeartbeat::beat((string) $event->job->getQueue());
    }
}
