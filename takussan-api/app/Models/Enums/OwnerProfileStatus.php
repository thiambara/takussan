<?php

namespace App\Models\Enums;

enum OwnerProfileStatus: string
{
    case Active = 'active';
    case Inactive = 'inactive';
    case Blocked = 'blocked';
}
