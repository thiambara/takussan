<?php

namespace App\Models\Enums;

enum BookingPaymentType: string
{
    case Deposit = 'deposit';
    case Advance = 'advance';
    case Fee = 'fee';
}
