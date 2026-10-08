<?php

namespace App\Models\Enums;

/**
 * TCK-600 (ADR-0055 §4) — comment une session d'impersonation a fini. Colonne `string(20)`, pas
 * d'`enum()` SQL (ADR-0007).
 */
enum ImpersonationEndReason: string
{
    /** L'opérateur a quitté la session. */
    case Stopped = 'stopped';
    /** Les 15 minutes sont échues (`impersonation:close-expired`). */
    case Expired = 'expired';
    /** L'opérateur a été retiré ou bloqué. */
    case OperatorRevoked = 'operator_revoked';
    /** Le compte visé a été bloqué. */
    case TargetBlocked = 'target_blocked';
}
