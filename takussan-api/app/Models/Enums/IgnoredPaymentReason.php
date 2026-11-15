<?php

namespace App\Models\Enums;

/**
 * TCK-2932 — pourquoi un paiement n'aura jamais de ligne de banque. Le libellé est au front ;
 * `other` exige une note.
 */
enum IgnoredPaymentReason: string
{
    /** Espèces gardées en caisse, jamais déposées. */
    case CashKept = 'cash_kept';

    /** Versé sur un autre compte que celui des relevés importés. */
    case OtherAccount = 'other_account';

    case Other = 'other';
}
