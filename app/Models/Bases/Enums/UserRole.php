<?php

namespace App\Models\Bases\Enums;

enum UserRole: string
{
    case Customer = 'customer';
    case Admin = 'admin';
    case SuperAdmin = 'super_admin';
    case Vendor = 'vendor';
}
