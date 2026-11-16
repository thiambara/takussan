<?php

namespace App\Models\Enums;

use App\Services\Maintenance\ReopenedRequestBills;

/**
 * TCK-594 (ADR-0039 §8) — le cycle d'une facture d'intervention reçue d'un prestataire.
 */
enum ServiceProviderBillStatus: string
{
    /**
     * TCK-2911 (ADR-0120 § 1) — « À facturer » : née à la clôture, lue de son seul prestataire, qui
     * l'envoie par « Facturer » (`POST …/submit`). Pas encore une pièce reçue : ni validée, ni payée,
     * ni imputée au bailleur.
     */
    case Draft = 'draft';
    case PendingValidation = 'pending_validation';
    case Validated = 'validated';
    case Rejected = 'rejected';
    case Paid = 'paid';
    /**
     * TCK-2270 (P224.01, ADR-0039 § 8, amendement du 2026-10-25) : l'intervention contestée ou
     * annulée, la facture encore ouverte et non engagée ({@see ReopenedRequestBills}).
     */
    case Cancelled = 'cancelled';
}
