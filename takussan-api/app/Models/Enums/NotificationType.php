<?php

namespace App\Models\Enums;

enum NotificationType: string
{
    case Booking = 'booking';
    case Payment = 'payment';
    case Lease = 'lease';
    case Maintenance = 'maintenance';
    case Visit = 'visit';
    case Message = 'message';
    case System = 'system';
}
