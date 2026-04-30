<?php

namespace App\Models\Enums;

enum BankStatementStatus: string
{
    case Processing = 'processing';
    case ReadyForReview = 'ready_for_review';
    case PartiallyReconciled = 'partially_reconciled';
    case Reconciled = 'reconciled';
    case Archived = 'archived';

    public function isClosed(): bool
    {
        return in_array($this, [self::Reconciled, self::Archived], true);
    }
}
