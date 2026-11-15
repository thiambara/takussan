<?php

namespace App\Models\Enums;

/**
 * TCK-2578 (ADR-0101) — le verdict du compte rendu de visite, saisi par l'agent. Le libellé
 * (« Intéressé », « À réfléchir », « Pas intéressé ») appartient au front.
 */
enum VisitReportOutcome: string
{
    case Interested = 'interested';
    case Thinking = 'thinking';
    case NotInterested = 'not_interested';
}
