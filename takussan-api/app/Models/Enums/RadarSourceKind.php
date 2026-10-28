<?php

namespace App\Models\Enums;

/** TCK-2386 (ADR-0077 §1) — comment l'opérateur a saisi l'annonce. */
enum RadarSourceKind: string
{
    case Url = 'url';
    case Text = 'text';
    case Captures = 'captures';
}
