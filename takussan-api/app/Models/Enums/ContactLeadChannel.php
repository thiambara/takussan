<?php

namespace App\Models\Enums;

/**
 * TCK-590 — par où une demande de contact est arrivée.
 *
 * `form` est une demande à TRAITER : elle a une identité (nom, et téléphone ou e-mail) et un
 * message. `whatsapp` et `call` ne sont que des CLICS comptés — aucune identité, aucun message —
 * et restent hors de la file « à traiter » (option retenue du ticket).
 *
 * Chaîne + contrôle applicatif, jamais `enum()` SQL (ADR-0007).
 */
enum ContactLeadChannel: string
{
    case Form = 'form';
    case Whatsapp = 'whatsapp';
    case Call = 'call';
}
