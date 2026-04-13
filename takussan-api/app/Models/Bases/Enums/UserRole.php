<?php

namespace App\Models\Bases\Enums;

enum UserRole: string
{
    case Customer = 'customer';
    case AgencyAdmin = 'agency_admin';
    case SuperAdmin = 'super_admin';
    case Vendor = 'vendor';
}
