<?php

namespace App\Models\Enums;

enum ConversationType: string
{
    case Direct = 'direct';
    case Group = 'group';
    case Booking = 'booking';
    case Lease = 'lease';
    case Property = 'property';
    case Support = 'support';
}
