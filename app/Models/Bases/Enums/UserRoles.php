<?php

namespace App\Models\Bases\Enums;

enum UserRoles: string
{
    case CUSTOMER = 'customer';
    case ADMIN = 'admin';
    case SUPER_ADMIN = 'super_admin';
    case VENDOR = 'vendor';
}
