<?php

namespace App\Models\Enums;

/**
 * TCK-597 (ADR-0043 §7) — le motif d'une décision de modération est un CODE, traduit par le front
 * (`moderation.reasons.<code>`). Le texte libre (`reason`) n'est requis que pour `other` : un motif
 * écrit à la main ne se filtre pas, ne se compte pas, et ne se traduit pas pour le propriétaire
 * qui reçoit la notification.
 */
enum ModerationReasonCode: string
{
    case Fraud = 'fraud';
    case Spam = 'spam';
    case Misleading = 'misleading';
    case Offensive = 'offensive';
    case PersonalData = 'personal_data';
    case Duplicate = 'duplicate';
    case ConflictOfInterest = 'conflict_of_interest';
    case OffTopic = 'off_topic';
    case Other = 'other';
}
