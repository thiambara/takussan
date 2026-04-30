<?php

namespace App\Models\Enums;

enum BankStatementSourceFormat: string
{
    case Csv = 'csv';
    case Ofx = 'ofx';
}
