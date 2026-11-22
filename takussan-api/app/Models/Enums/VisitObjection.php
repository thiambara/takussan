<?php

namespace App\Models\Enums;

/**
 * TCK-2578 (ADR-0101) — ce qui a pesé dans la visite, en liste fermée (`report_objections`) : des
 * codes sans texte, gardés pour les statistiques de l'agence même quand la note est effacée.
 */
enum VisitObjection: string
{
    case Price = 'price';
    case Neighborhood = 'neighborhood';
    case Size = 'size';
    case Condition = 'condition';
    case Availability = 'availability';
    case Guarantor = 'guarantor';
}
