<?php

namespace App\Models\Enums;

enum AnnouncementSeverity: string
{
    case Info = 'info';
    case Success = 'success';
    case Warning = 'warning';
    case Critical = 'critical';
}
