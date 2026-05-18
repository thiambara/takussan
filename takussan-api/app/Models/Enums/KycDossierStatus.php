<?php

namespace App\Models\Enums;

enum KycDossierStatus: string
{
    case Pending = 'pending';
    case Submitted = 'submitted';
    case Verified = 'verified';
    case Rejected = 'rejected';
}
