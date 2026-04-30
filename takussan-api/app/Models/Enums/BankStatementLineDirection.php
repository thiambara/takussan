<?php

namespace App\Models\Enums;

enum BankStatementLineDirection: string
{
    case Credit = 'credit';
    case Debit = 'debit';
}
