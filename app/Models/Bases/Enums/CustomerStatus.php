<?php

namespace App\Models\Bases\Enums;

enum CustomerStatus: string
{
    case Pending = 'pending';
    case Confirmed = 'confirmed';
    case Cancelled = 'cancelled';
    case Completed = 'completed';
}
