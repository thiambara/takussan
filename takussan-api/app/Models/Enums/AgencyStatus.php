<?php

namespace App\Models\Enums;

enum AgencyStatus: string
{
    case Active = 'active';
    case Inactive = 'inactive';
    case Suspended = 'suspended';
}
