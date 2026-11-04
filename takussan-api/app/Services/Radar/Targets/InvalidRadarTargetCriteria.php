<?php

namespace App\Services\Radar\Targets;

use InvalidArgumentException;

/**
 * TCK-2468 — des critères de cible refusés par {@see RadarTargetCriteria}. `errorCode` est un code `radar.targets.*` que
 * le front traduit ; `params` le complète (`field` : la clé en cause, `max`…). La console le reçoit en 422 ; la révision
 * par l'IA (TCK-2470) l'écarte sans rien écrire.
 */
final class InvalidRadarTargetCriteria extends InvalidArgumentException
{
    /** @param  array<string, mixed>  $params */
    public function __construct(public readonly string $errorCode, public readonly array $params = [])
    {
        parent::__construct($errorCode);
    }
}
