<?php

namespace App\Models\Enums;

enum NotificationChannel: string
{
    case App = 'app';
    case Email = 'email';
    case Sms = 'sms';
    case Push = 'push';
    case Whatsapp = 'whatsapp';
}
