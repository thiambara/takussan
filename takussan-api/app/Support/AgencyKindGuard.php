<?php

namespace App\Support;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\User;

/**
 * Backend twin of `lib/access/server-guards.ts` (`ensureStandardAgencyOrRedirect`).
 *
 * Aborts with 403 when a non-global actor's active agency is on
 * `kind=individual`. Super-admins bypass (cross-tenant scope by design —
 * they may legitimately operate on any agency regardless of kind). Actors
 * without an active agency are passed through (the caller
 * is responsible for the upstream `abort_if($agencyId === null, …)`).
 */
class AgencyKindGuard
{
    public static function ensureStandardForNonGlobal(User $user, ?int $agencyId): void
    {
        if ($user->isSuperAdmin()) {
            return;
        }
        if ($agencyId === null) {
            return;
        }
        $agency = Agency::find($agencyId);
        abort_unless(
            $agency && $agency->kind === AgencyKind::Standard,
            403,
            'This feature is reserved for standard agencies.',
        );
    }
}
