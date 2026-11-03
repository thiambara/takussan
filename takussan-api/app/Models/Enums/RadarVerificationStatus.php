<?php

namespace App\Models\Enums;

/** TCK-2388 (ADR-0076 §7, ADR-0077 §3) — où en est la vérification IA d'une réponse déposée. */
enum RadarVerificationStatus: string
{
    case Pending = 'pending';
    case Done = 'done';
    case Failed = 'failed';
}
