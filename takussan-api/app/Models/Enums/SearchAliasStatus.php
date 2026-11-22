<?php

namespace App\Models\Enums;

/** TCK-2476 (ADR-0088 §7) — une variante `active` est comprise par la recherche ; une `rejected` ne l'est pas et ne revient jamais par l'IA. */
enum SearchAliasStatus: string
{
    case Active = 'active';
    case Rejected = 'rejected';
}
