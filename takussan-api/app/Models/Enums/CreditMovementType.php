<?php

namespace App\Models\Enums;

/** TCK-633 lot F (ADR-0061 §2). Positifs : grant, refund. Négatifs : spend, expire, admin_debit. */
enum CreditMovementType: string
{
    case Grant = 'grant';
    case Spend = 'spend';
    case Refund = 'refund';
    case Expire = 'expire';
    case AdminDebit = 'admin_debit';
}
