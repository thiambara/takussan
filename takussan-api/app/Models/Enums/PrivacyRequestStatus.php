<?php

namespace App\Models\Enums;

/** TCK-601 (ADR-0044 §4) — registre des demandes de droits. */
enum PrivacyRequestStatus: string
{
    case Received = 'received';
    case InProgress = 'in_progress';
    case Answered = 'answered';
    case Rejected = 'rejected';
    case Withdrawn = 'withdrawn';

    /** Une demande close n'a plus d'échéance à tenir : elle ne peut plus être « en retard ». */
    public function isOpen(): bool
    {
        return in_array($this, [self::Received, self::InProgress], true);
    }
}
