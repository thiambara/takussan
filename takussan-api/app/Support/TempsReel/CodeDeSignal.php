<?php

namespace App\Support\TempsReel;

/**
 * TCK-2952 (ADR-0129 § 1) — les codes qu'un signal peut porter dans sa clé `event`. Fermé : un code neuf
 * s'ajoute ici, avec le lot qui l'émet. Le front trie ses signaux par ce code, jamais par une donnée.
 *
 * Le lot 0 pose les six codes de TCK-2955 ; TCK-2952 n'émet que `notifications.updated`.
 */
enum CodeDeSignal: string
{
    case MessageCreated = 'message.created';
    case MessageUpdated = 'message.updated';
    case ConversationRead = 'conversation.read';
    case ParticipantsUpdated = 'participants.updated';
    case BoiteUpdated = 'boite.updated';
    case NotificationsUpdated = 'notifications.updated';
    // TCK-2974 (ADR-0131 § 3) — une proposition du copilote est prête, refusée ou en échec : au SEUL demandeur.
    case CopiloteUpdated = 'copilote.updated';
}
