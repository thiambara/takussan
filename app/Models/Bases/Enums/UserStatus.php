<?php

namespace App\Models\Bases\Enums;

enum UserStatus: string
{
    case ACTIVE = 'active';
    case INACTIVE = 'inactive';
    case BLOCKED = 'blocked';
    case DELETED = 'deleted';
}
