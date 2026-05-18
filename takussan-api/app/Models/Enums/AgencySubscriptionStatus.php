<?php

namespace App\Models\Enums;

enum AgencySubscriptionStatus: string
{
    case Trialing = 'trialing';
    case Active = 'active';
    case PastDue = 'past_due';
    case Suspended = 'suspended';
    case Ended = 'ended';
}
