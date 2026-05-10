<?php

namespace App\Models\Enums;

enum AgencyKind: string
{
    case Standard = 'standard';
    case Individual = 'individual';

    public function isIndividual(): bool
    {
        return $this === self::Individual;
    }

    public function isStandard(): bool
    {
        return $this === self::Standard;
    }
}
