<?php

namespace App\Models\Enums;

/**
 * TCK-591 — la nature d'une note épinglée à un changement d'étape. `null` = note libre.
 * Le préfixe affiché (« Perte : », « Lost: ») appartient au front.
 *
 * TCK-2578 (ADR-0101) — `visit_report` : le compte rendu d'une visite, UNE note par visite
 * (`property_visit_id`), réécrite à chaque modification, lue par le seul personnel de l'agence.
 */
enum CustomerNoteKind: string
{
    case Conversion = 'conversion';
    case Loss = 'loss';
    case VisitReport = 'visit_report';
}
