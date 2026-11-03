<?php

namespace App\Models\Enums;

/**
 * TCK-2387 — pourquoi l'opérateur écarte une annonce. Écrit dans `stage_reason` sous la forme
 * `radar.discard.<valeur>` (un code, jamais de prose : le front possède le libellé).
 */
enum RadarDiscardReason: string
{
    case NotRealEstate = 'not_real_estate';
    case OutOfScope = 'out_of_scope';
    case NoLongerAvailable = 'no_longer_available';
    case UnusableSource = 'unusable_source';
    case Other = 'other';

    public function code(): string
    {
        return 'radar.discard.'.$this->value;
    }
}
