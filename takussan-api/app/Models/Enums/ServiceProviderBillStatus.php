<?php

namespace App\Models\Enums;

use App\Services\Maintenance\ReopenedRequestBills;

/**
 * TCK-594 (ADR-0039 §8) — le cycle d'une facture d'intervention reçue d'un prestataire.
 */
enum ServiceProviderBillStatus: string
{
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
