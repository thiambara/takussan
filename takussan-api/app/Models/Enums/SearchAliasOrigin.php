<?php

namespace App\Models\Enums;

/** TCK-2476 (ADR-0088 §7) — d'où vient une variante : l'usage `search.variantes`, ou un geste d'opérateur (jamais retouché par l'IA). */
enum SearchAliasOrigin: string
{
    case Ai = 'ai';
    case Manual = 'manual';
}
