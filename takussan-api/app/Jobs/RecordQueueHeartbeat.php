<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

/**
 * Le battement d'une file (TCK-600, S15) : planifié chaque minute sur chacune des files, il
 * n'est EXÉCUTÉ que si un worker consomme la file. Une file sans consommateur ne lève rien — ses
 * jobs s'empilent en silence (`scripts/check-queues.mjs`) ; l'âge du dernier battement est la seule
 * chose qui la trahit, et `HealthcheckService` le lit.
 *
 * TCK-934 (P43.03) — le même battement est aussi écrit par le worker lui-même, à chaque tour de
 * boucle et à chaque job dépilé (`App\Listeners\Admin\RecordWorkerHeartbeat`) : ce job, lui,
 * attend derrière l'arriéré de sa file.
 */
class RecordQueueHeartbeat implements ShouldQueue
{
    use Queueable;

    /**
     * Les files que `deploy/takussan/compose.api.yml` consomme. `long` (TCK-2401, ADR-0078) : le
     * battement planifié y part sur la connexion par défaut ; `database-long` partage la table
     * `jobs`, et c'est le délai de reprise du worker qui dépile (`worker-long`) qui compte. `ai`
     * (TCK-2402, ADR-0078) : `worker-ia` est le seul à la lire ; un appel au modèle dure 85 s au plus,
     * sous le seuil `degraded` du battement (180 s) : les seuils des files courtes lui conviennent.
     */
    public const QUEUES = ['default', 'media', 'notifications-urgent', 'reconciliation', 'long', 'ai'];

    public function __construct(public readonly string $fileSurveillee)
    {
        $this->onQueue($fileSurveillee);
    }

    public static function cacheKey(string $queue): string
    {
        return "health:heartbeat:{$queue}";
    }

    public function handle(): void
    {
        self::beat($this->fileSurveillee);
    }

    /** Écrit le battement d'une file surveillée ; une autre file n'écrit rien. */
    public static function beat(string $queue): void
    {
        if (! in_array($queue, self::QUEUES, true)) {
            return;
        }

        Cache::put(self::cacheKey($queue), now()->getTimestamp(), now()->addDay());
    }
}
