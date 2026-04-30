<?php

namespace App\Models\Enums;

enum LeasePaymentType: string
{
    case Rent = 'rent';
    case Charges = 'charges';
    case Deposit = 'deposit';
    case DepositRefund = 'deposit_refund';
    case Regularization = 'regularization';
    case Penalty = 'penalty';
}
