<?php

namespace App\Models\Enums;

enum RelationshipStatus: string
{
    case Active = 'active';
    case Ended = 'ended';
    case Suspended = 'suspended';
}
