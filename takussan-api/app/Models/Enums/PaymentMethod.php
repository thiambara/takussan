<?php

namespace App\Models\Enums;

enum PaymentMethod: string
{
    case Cash = 'cash';
    case BankTransfer = 'bank_transfer';
    case MobileMoney = 'mobile_money';
    case Check = 'check';
    case Card = 'card';
}
