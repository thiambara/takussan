<?php

namespace App\Models\Enums;

/** TCK-2476 (ADR-0088 §7) — ce qu'une variante d'écriture désigne : un lieu du référentiel, un type de bien, un terme de l'analyse. */
enum SearchAliasTargetKind: string
{
    case City = 'city';
    case Neighborhood = 'neighborhood';
    case PropertyType = 'property_type';
    case Term = 'term';
}
