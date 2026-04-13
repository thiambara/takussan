<?php

namespace App\Models\Bases\Enums;

enum CustomerStatus: string
{
    case Active = 'active';
    case Inactive = 'inactive';
    case Blocked = 'blocked';
    case Deleted = 'deleted';
}
