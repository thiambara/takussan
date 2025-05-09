<?php

namespace App\Models\Bases\Enums;

enum UserStatus: string
{
    case Active = 'active';
    case Inactive = 'inactive';
    case Blocked = 'blocked';
    case Deleted = 'deleted';
}
