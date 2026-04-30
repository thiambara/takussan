<?php

namespace App\Models\Enums;

enum LeaseStatus: string
{
    case Draft = 'draft';
    case PendingSignature = 'pending_signature';
    case Active = 'active';
    case Expired = 'expired';
    /**
     * TCK-090 — Early termination has been requested; the notice period is
     * running. The lease is still effectively active (rent due) until
     * `early_termination_effective_date`, at which point a daily job moves
     * it to {@see self::Terminated} provided the penalty invoice is paid.
     */
    case Terminating = 'terminating';
    case Terminated = 'terminated';
    case Renewed = 'renewed';
}
