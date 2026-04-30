<?php

namespace App\Models\Enums;

enum PayoutStatus: string
{
    case Pending = 'pending';
    case Scheduled = 'scheduled';
    case Processing = 'processing';
    case Completed = 'completed';
    case Failed = 'failed';
    case Cancelled = 'cancelled';
}
