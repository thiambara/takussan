<?php

namespace App\Models\Enums;

/**
 * TCK-2468 (ADR-0087 §5) — l'état d'une cible. Seule une cible `active` borne la collecte et reçoit des annonces ;
 * `paused` la garde sans effet ; `retired` remplace la suppression (une cible ne s'efface jamais).
 */
enum RadarTargetStatus: string
{
    case Active = 'active';
    case Paused = 'paused';
    case Retired = 'retired';
}
