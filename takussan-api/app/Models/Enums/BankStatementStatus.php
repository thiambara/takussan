<?php

namespace App\Models\Enums;

enum BankStatementStatus: string
{
    case Processing = 'processing';
    case ReadyForReview = 'ready_for_review';
    case PartiallyReconciled = 'partially_reconciled';
    case Reconciled = 'reconciled';
    case Archived = 'archived';
    // TCK-593 — l'analyse a échoué, ou aucune ligne d'un fichier non vide n'a pu être lue. Un
    // relevé ne reste plus `processing` à vie, ni `ready_for_review` à zéro ligne.
    case Failed = 'failed';

    public function isClosed(): bool
    {
        return in_array($this, [self::Reconciled, self::Archived, self::Failed], true);
    }
}
