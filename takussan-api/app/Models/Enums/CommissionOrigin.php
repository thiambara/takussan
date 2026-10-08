<?php

namespace App\Models\Enums;

/**
 * TCK-595 (ADR-0049 §3) — pourquoi un bénéficiaire reçoit une part de la commission d'un bail : il
 * l'a négocié (`leases.agent_id`), ou il est collaborateur `agent` du bien. Un négociateur également
 * collaborateur n'a qu'une ligne, d'origine `negotiator`.
 */
enum CommissionOrigin: string
{
    case Negotiator = 'negotiator';
    case Collaborator = 'collaborator';
}
