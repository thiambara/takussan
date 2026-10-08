<?php

namespace App\Models\Enums;

/**
 * TCK-594 (ADR-0039 §2) — qui reçoit l'argent d'un `Payout`.
 *
 * Stocké en chaîne (`payouts.payee_role`), jamais en `enum()` SQL (ADR-0007). Tout lecteur qui somme
 * des « reversements au bailleur » filtre `landlord` : une caution rendue est `tenant`.
 */
enum PayeeRole: string
{
    case Landlord = 'landlord';
    case Tenant = 'tenant';
    case ServiceProvider = 'service_provider';
}
