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
}
