<?php

namespace App\Models\Enums;

enum RelationshipStatus: string
{
    case Active = 'active';
    /** Réservé (TCK-1307, P115.07) : aucun chemin de `app/` ne le pose. */
    case Ended = 'ended';
    /** Réservé (TCK-1307, P115.07) : aucun chemin de `app/` ne le pose. */
    case Suspended = 'suspended';
}
