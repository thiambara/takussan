<?php

namespace App\Models\Enums;

enum ConversationStatus: string
{
    case Active = 'active';
    /** Réservé (TCK-1307, P115.07) : aucun chemin de `app/` ne le pose ; l'archivage est par participant (`conversation_participants.archived_at`). */
    case Archived = 'archived';
    /**
     * TCK-2957 (ADR-0128 § 1) — le fil dont l'objet (son sujet) est supprimé : posé par
     * `FermeLeFilDeSonObjet`, retiré à la restauration de l'objet. N'accepte plus d'écriture
     * (`ConversationAccess::allowsWriting`) ; la lecture ne change pas. Cas tenu en réserve par
     * TCK-1307 (P115.07) jusqu'à ce ticket.
     */
    case Closed = 'closed';
}
