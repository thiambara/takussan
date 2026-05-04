<?php

namespace App\Models\Enums;

enum CollaborationStatus: string
{
    case Active = 'active';
    case Paused = 'paused';
    case Ended = 'ended';
}
