<?php

namespace App\Models\Enums;

/** TCK-633 lot F (ADR-0061 §1) — `purchase` est réservé à la phase 2 (§11) : aucun code ne l'écrit. */
enum CreditLotOrigin: string
{
    case Welcome = 'welcome';
    case AdminGrant = 'admin_grant';
    case Refund = 'refund';
    case Purchase = 'purchase';
}
