<?php

namespace App\Models\Enums;

/**
 * TCK-591 — la nature d'une note épinglée à un changement d'étape. `null` = note libre.
 * Le préfixe affiché (« Perte : », « Lost: ») appartient au front.
 *
 * TCK-2578 (ADR-0101) — `visit_report` : le compte rendu d'une visite, UNE note par visite
 * (`property_visit_id`), réécrite à chaque modification, lue par le seul personnel de l'agence.
 *
 * TCK-2582 (ADR-0101 § 1) — `lead_message` : le message d'origine de la demande de contact,
 * recopié tel quel à la conversion (ou au rattachement) de la demande, UNE fois par demande, daté
 * de la demande ; lu, comme le compte rendu, par le seul personnel de l'agence.
 */
enum CustomerNoteKind: string
{
    case Conversion = 'conversion';
    case Loss = 'loss';
    case VisitReport = 'visit_report';
    case LeadMessage = 'lead_message';

    /**
     * TCK-2582 — les natures réservées au personnel de l'agence de la fiche
     * (`CustomerPolicy::viewVisitReports`) : hors de leur lecture, elles sortent des notes et du fil.
     *
     * @return list<string>
     */
    public static function staffOnlyValues(): array
    {
        return [self::VisitReport->value, self::LeadMessage->value];
    }
}
