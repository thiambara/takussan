<?php

namespace App\Models\Enums;

/**
 * TCK-594 (ADR-0039 §8) — le cycle d'une facture d'intervention reçue d'un prestataire.
 */
enum ServiceProviderBillStatus: string
{
    case PendingValidation = 'pending_validation';
    case Validated = 'validated';
    case Rejected = 'rejected';
    case Paid = 'paid';
    case Cancelled = 'cancelled';
}
