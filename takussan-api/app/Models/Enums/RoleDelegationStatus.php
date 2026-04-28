<?php

namespace App\Models\Enums;

enum RoleDelegationStatus: string
{
    case Scheduled = 'scheduled';
    case Active = 'active';
    case Revoked = 'revoked';
    case Expired = 'expired';
}
