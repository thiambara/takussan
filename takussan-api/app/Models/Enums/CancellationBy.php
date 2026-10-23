<?php

namespace App\Models\Enums;

enum CancellationBy: string
{
    case Owner = 'owner';
    case Customer = 'customer';
    case Agent = 'agent';
    /** Réservé (TCK-1898, P196.03) : aucun chemin de `app/` ne le pose ; `BookingService::cancel` n'écrit que `customer`, `owner` ou `agent`, et l'expiration d'une réservation n'est pas une annulation. */
    case System = 'system';
}
