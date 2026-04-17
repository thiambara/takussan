<?php

namespace App\Models\Enums;

enum MaintenanceStatus: string
{
    case Open = 'open';
    case Acknowledged = 'acknowledged';
    case Assigned = 'assigned';
    case InProgress = 'in_progress';
    case Completed = 'completed';
    case Closed = 'closed';
    case Cancelled = 'cancelled';
}
