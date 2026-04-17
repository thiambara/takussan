<?php

namespace App\Models\Enums;

enum MaintenanceCategory: string
{
    case Plumbing = 'plumbing';
    case Electrical = 'electrical';
    case Structural = 'structural';
    case Appliance = 'appliance';
    case Painting = 'painting';
    case Cleaning = 'cleaning';
    case PestControl = 'pest_control';
    case Locksmith = 'locksmith';
    case Other = 'other';
}
