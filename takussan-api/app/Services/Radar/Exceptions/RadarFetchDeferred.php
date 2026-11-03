<?php

namespace App\Services\Radar\Exceptions;

use RuntimeException;

/**
 * TCK-2386 (ADR-0077 §10) — le domaine a été lu il y a moins de `radar.fetch.min_delay_seconds`
 * (ou l'est en ce moment) : la lecture n'est pas refusée, elle est remise à plus tard. Le job la
 * relâche dans la file (`release($retryAfterSeconds)`).
 */
final class RadarFetchDeferred extends RuntimeException
{
    public function __construct(public readonly int $retryAfterSeconds)
    {
        parent::__construct('radar.fetch.deferred');
    }
}
