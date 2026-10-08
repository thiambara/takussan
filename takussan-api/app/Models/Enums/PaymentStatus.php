<?php

namespace App\Models\Enums;

enum PaymentStatus: string
{
    case Pending = 'pending';
    case Paid = 'paid';
    case Late = 'late';
    case PartiallyPaid = 'partially_paid';
    case Failed = 'failed';
    case Refunded = 'refunded';

    /**
     * VERIF-596 passe 5 (M-E) — une échéance qui n'est plus due : celles d'un bail parent que son
     * renouvellement a remplacées (`LeaseRenewalService`). Jamais posé par un client.
     */
    case Cancelled = 'cancelled';
}
