<?php

namespace App\Models\Enums;

enum CancellationBy: string
{
    case Owner = 'owner';
    case Customer = 'customer';
    case Agent = 'agent';
    case System = 'system';
}
