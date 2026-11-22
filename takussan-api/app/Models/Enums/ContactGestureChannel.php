<?php

namespace App\Models\Enums;

/**
 * TCK-2583 (ADR-0103 § 1-2) — le canal d'un geste de contact lancé depuis la console. Le geste
 * mesuré est l'OUVERTURE de l'application externe, pas l'envoi : « contacté », jamais « joint ».
 * Le journal ne porte que ce canal, aucune coordonnée.
 */
enum ContactGestureChannel: string
{
    case Whatsapp = 'whatsapp';
    case Call = 'call';
    case Email = 'email';
    case Sms = 'sms';
}
