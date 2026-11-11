<?php

namespace App\Models\Enums;

/**
 * TCK-2658 (ADR-0105 § 2) — le canal d'une relance NOTÉE par l'agence : elle a ouvert WhatsApp ou
 * appelé, depuis son propre téléphone. Takussan n'envoie rien ; un envoi par la plateforme serait un
 * autre ADR (et une autre `source`, pas un canal de plus ici).
 */
enum ReminderChannel: string
{
    case Whatsapp = 'whatsapp';
    case Call = 'call';
}
