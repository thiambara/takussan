<?php

namespace App\Models\Bases\Enums;

abstract class UserStatus
{
    const ACTIVE = 'active';
    const INACTIVE = 'inactive';
    const BLOCKED = 'blocked';
    const DELETED = 'deleted';
}
