<?php

namespace App\Models\Enums;

enum BankStatementLineMatchStatus: string
{
    case Unmatched = 'unmatched';
    case Suggested = 'suggested';
    case Confirmed = 'confirmed';
    case Ignored = 'ignored';
}
