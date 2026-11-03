<?php

namespace App\Models\Enums;

/** TCK-2383 (ADR-0076 §5) — l'issue d'une ligne de `ai_calls`. */
enum AiCallOutcome: string
{
    case Success = 'success';
    case CacheHit = 'cache_hit';
    case FailedOver = 'failed_over';
    case Error = 'error';
    case Refused = 'refused';
}
