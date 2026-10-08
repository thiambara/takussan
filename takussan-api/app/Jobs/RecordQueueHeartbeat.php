<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

/**
 * Le battement d'une file (TCK-600, S15) : planifié chaque minute sur chacune des quatre files, il
 * n'est EXÉCUTÉ que si un worker consomme la file. Une file sans consommateur ne lève rien — ses
 * jobs s'empilent en silence (`scripts/check-queues.mjs`) ; l'âge du dernier battement est la seule
 * chose qui la trahit, et `HealthcheckService` le lit.
 */
class RecordQueueHeartbeat implements ShouldQueue
{
    use Queueable;

    /** Les files que `deploy/takussan/compose.api.yml` consomme. */
    public const QUEUES = ['default', 'media', 'notifications-urgent', 'reconciliation'];

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
        Cache::put(self::cacheKey($this->fileSurveillee), now()->getTimestamp(), now()->addDay());
    }
}
