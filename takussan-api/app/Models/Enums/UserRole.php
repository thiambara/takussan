<?php

namespace App\Models\Enums;

enum UserRole: string
{
    case Customer = 'customer';
    case AgencyAdmin = 'agency_admin';
    case SuperAdmin = 'super_admin';
    case Agent = 'agent';
    case Owner = 'owner';
    case ServiceProvider = 'service_provider';
}
