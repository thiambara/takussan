<?php

namespace App\Policies;

use App\Models\User;

class ActivityLogPolicy
{
    public function export(User $user): bool
    {
        return $user->isSuperAdmin()
            || ($user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id));
    }
}
