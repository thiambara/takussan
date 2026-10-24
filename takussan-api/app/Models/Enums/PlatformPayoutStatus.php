<?php

namespace App\Models\Enums;

enum PlatformPayoutStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    /** Réservé (TCK-2078, P196.01) : aucun chemin de `app/` ne le pose ; la matrice de `PlatformPayoutService` l'admet encore, la console ne le propose plus. */
    case Processing = 'processing';
    case Paid = 'paid';
    /** Réservé (TCK-2078, P196.01) : aucun chemin de `app/` ne le pose ; un virement refusé se range aujourd'hui en `cancelled`. */
    case Failed = 'failed';
    case Cancelled = 'cancelled';
}
