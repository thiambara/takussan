<?php

namespace App\Models\Enums;

/**
 * TCK-595 (ADR-0049 §3) — l'état d'une ligne du grand livre des commissions.
 *
 * Stocké en chaîne (`commission_entries.status`), jamais en `enum()` SQL (ADR-0007). Seule une ligne
 * `due` change d'état : `paid` et `cancelled` sont terminaux.
 */
enum CommissionEntryStatus: string
{
    case Due = 'due';
    case Paid = 'paid';
    case Cancelled = 'cancelled';
}
