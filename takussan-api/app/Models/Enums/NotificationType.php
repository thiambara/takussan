<?php

namespace App\Models\Enums;

enum NotificationType: string
{
    case Booking = 'booking';
    case Payment = 'payment';
    case Lease = 'lease';
    case Maintenance = 'maintenance';
    case Visit = 'visit';
    case Message = 'message';
    case System = 'system';
    case BankStatementImported = 'bank_statement_imported';
    case BankStatementFinalized = 'bank_statement_finalized';
    case RoleDelegated = 'role_delegated';
    case RoleDelegationExpired = 'role_delegation_expired';
    case RoleDelegationRevoked = 'role_delegation_revoked';
}
