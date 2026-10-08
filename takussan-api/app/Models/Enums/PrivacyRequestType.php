<?php

namespace App\Models\Enums;

/** TCK-601 (ADR-0044 §4) — registre des demandes de droits. */
enum PrivacyRequestType: string
{
    case Access = 'access';
    case Rectification = 'rectification';
    case Opposition = 'opposition';
    case Erasure = 'erasure';
    case Portability = 'portability';
}
