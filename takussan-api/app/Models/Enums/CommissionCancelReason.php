<?php

namespace App\Models\Enums;

/**
 * TCK-2661 (ADR-0049 §3) — le motif d'annulation d'une ligne du grand livre, visible du bénéficiaire.
 * Un code : le front écrit le libellé (principe 5). `other` exige un texte libre.
 */
enum CommissionCancelReason: string
{
    case LeaseTerminatedBeforeMoveIn = 'lease_terminated_before_move_in';
    case WrongBeneficiary = 'wrong_beneficiary';
    case WrongRateOrBase = 'wrong_rate_or_base';
    case Other = 'other';
}
