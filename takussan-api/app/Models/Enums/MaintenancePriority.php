<?php

namespace App\Models\Enums;

enum MaintenancePriority: string
{
    case Low = 'low';
    case Normal = 'normal';
    case High = 'high';
    case Urgent = 'urgent';
}
