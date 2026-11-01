<?php

namespace App\Models\Enums;

/** TCK-2386 (ADR-0077) — la confiance déclarée par l'extraction pour un champ ou un rapprochement. */
enum RadarConfidence: string
{
    case High = 'high';
    case Medium = 'medium';
    case Low = 'low';

    /** Le plancher : ce que vaut un champ dont aucune confiance n'est lisible. */
    public static function lowest(): self
    {
        return self::Low;
    }
}
