<?php

namespace App\Models\Enums;

/**
 * TCK-594 (ADR-0039 §7) — une facture, ou l'avoir qui en annule une autre. Chacune a sa séquence.
 */
enum InvoiceKind: string
{
    case Invoice = 'invoice';
    case CreditNote = 'credit_note';

    public function prefix(): string
    {
        return match ($this) {
            self::Invoice => 'FA',
            self::CreditNote => 'AV',
        };
    }
}
