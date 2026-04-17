<?php

namespace App\Models\Enums;

enum ContractType: string
{
    case Sale = 'sale';
    case Rent = 'rent';
}
