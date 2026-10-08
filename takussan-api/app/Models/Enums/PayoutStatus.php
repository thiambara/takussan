<?php

namespace App\Models\Enums;

enum PayoutStatus: string
{
    /**
     * TCK-594 (ADR-0039 §4) — le net atteint le seuil d'approbation de l'agence : un second membre
     * détenant `payouts.approve` doit approuver avant tout paiement.
     */
    case AwaitingApproval = 'awaiting_approval';
    case Pending = 'pending';
    case Scheduled = 'scheduled';
    case Processing = 'processing';
    case Completed = 'completed';
    case Failed = 'failed';
    case Cancelled = 'cancelled';

    /**
     * Un reversement qui RETIENT ses pièces : `cancelled` et `failed` les détachent (ADR-0039 §3).
     *
     * @return list<self>
     */
    public static function holdingItems(): array
    {
        return [self::AwaitingApproval, self::Pending, self::Scheduled, self::Processing, self::Completed];
    }
}
