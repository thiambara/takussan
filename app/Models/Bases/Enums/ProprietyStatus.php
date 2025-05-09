<?php

namespace App\Models\Bases\Enums;

enum ProprietyStatus: string
{
    case Pending = 'pending';
    case Confirmed = 'confirmed';
    case Cancelled = 'cancelled';
    case Completed = 'completed';
}
