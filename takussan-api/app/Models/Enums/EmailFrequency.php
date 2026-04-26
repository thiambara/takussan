<?php

namespace App\Models\Enums;

enum EmailFrequency: string
{
    case Instant = 'instant';
    case Daily = 'daily';
    case Weekly = 'weekly';
    case Off = 'off';
}
