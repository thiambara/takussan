<?php

namespace App\Models\Enums;

/**
 * TCK-594 (ADR-0039 §6) — les destinations vers lesquelles une agence verse.
 */
enum PayoutMethodKind: string
{
    case Wave = 'wave';
    case OrangeMoney = 'orange_money';
    case FreeMoney = 'free_money';
    case BankTransfer = 'bank_transfer';

    public function isMobileMoney(): bool
    {
        return $this !== self::BankTransfer;
    }
}
