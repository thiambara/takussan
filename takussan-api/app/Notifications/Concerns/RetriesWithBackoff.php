<?php

namespace App\Notifications\Concerns;

use App\Support\Logging\SafeExceptionContext;
use Illuminate\Support\Facades\Log;

/**
 * TCK-1352 (P142.05) — ce que `CodedNotification` fait depuis TCK-800, pour toute notification
 * mise en file : attendre avant de réessayer, et journaliser l'échec final (la classe, le canal),
 * sans les paramètres ni le message de l'exception, qui peuvent porter des données personnelles.
 *
 * Sans lui, le worker (`--tries=3`, sans `--backoff`) épuisait ses trois essais en quelques
 * secondes, et l'échec ne laissait qu'une ligne de `failed_jobs`.
 *
 * Un code ou un lien court déclare en plus `retryUntil()`, égal à sa durée de vie : il ne se
 * livre pas périmé. `tests/Unit/Architecture/NotificationsEnFileTest.php` refuse une
 * notification en file sans `backoff()` ni `failed()`.
 */
trait RetriesWithBackoff
{
    /** Le canal de CETTE copie en file, retenu par {@see middleware()} (cf. `CodedNotification`). */
    public ?string $queuedChannel = null;

    /** @return list<int> */
    public function backoff(): array
    {
        return [60, 300, 900];
    }

    /** @return list<object> */
    public function middleware(object $notifiable, string $channel): array
    {
        $this->queuedChannel = $channel;

        return [];
    }

    public function failed(?\Throwable $e): void
    {
        $context = $e !== null ? SafeExceptionContext::of($e) : [];

        Log::error('[notifications] envoi abandonné', [
            'notification' => static::class,
            'channel' => $this->queuedChannel,
            'exception' => $context['exception'] ?? null,
            'at' => $context['at'] ?? null,
        ]);
    }
}
