<?php

namespace App\Models\Enums;

enum RentPeriod: string
{
    case Daily = 'daily';
    case Weekly = 'weekly';
    case Monthly = 'monthly';
    case Yearly = 'yearly';
}
