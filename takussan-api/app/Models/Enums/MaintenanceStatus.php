<?php

namespace App\Models\Enums;

enum MaintenanceStatus: string
{
    case Open = 'open';
    case Acknowledged = 'acknowledged';
    case QuoteRequested = 'quote_requested';
    case QuoteSubmitted = 'quote_submitted';
    // TCK-592 — ADR-0037 : le devis dépasse le plafond du bailleur, lui seul tranche.
    case AwaitingOwner = 'awaiting_owner';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Assigned = 'assigned';
    case InProgress = 'in_progress';
    case Completed = 'completed';
    case Closed = 'closed';
    case Cancelled = 'cancelled';
}
