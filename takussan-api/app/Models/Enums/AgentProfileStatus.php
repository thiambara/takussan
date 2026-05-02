<?php

namespace App\Models\Enums;

enum AgentProfileStatus: string
{
    case Active = 'active';
    case Inactive = 'inactive';
    case Suspended = 'suspended';
}
