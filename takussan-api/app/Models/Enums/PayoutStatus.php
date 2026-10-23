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
    /** Réservé (TCK-1307, P115.07) : aucun chemin de `app/` ne le pose ; admis par le traitement d'un reversement et la règle d'approbation. */
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

    /**
     * TCK-1804 (P162.07) — un reversement encore à venir : ni payé, ni échoué, ni annulé. L'attente
     * d'approbation en est (la somme partira une fois approuvée). Lu par `filter[upcoming]` de
     * `GET /api/payouts`, que la carte « Prochains versements » du bailleur demande.
     *
     * @return list<self>
     */
    public static function upcoming(): array
    {
        return [self::AwaitingApproval, self::Pending, self::Scheduled, self::Processing];
    }
}
