<?php

namespace App\Models\Enums;

enum LeaseStatus: string
{
    case Draft = 'draft';
    case PendingSignature = 'pending_signature';
    case Active = 'active';
    case Expired = 'expired';
    case Terminated = 'terminated';
    case Renewed = 'renewed';
}
