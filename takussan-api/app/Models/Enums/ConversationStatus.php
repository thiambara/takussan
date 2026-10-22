<?php

namespace App\Models\Enums;

enum ConversationStatus: string
{
    case Active = 'active';
    /** Réservé (TCK-1307, P115.07) : aucun chemin de `app/` ne le pose ; l'archivage est par participant (`conversation_participants.archived_at`). */
    case Archived = 'archived';
    /** Réservé (TCK-1307, P115.07) : aucun chemin de `app/` ne le pose. */
    case Closed = 'closed';
}
