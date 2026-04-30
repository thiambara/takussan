<?php

namespace App\Policies;

use App\Models\User;

class ActivityLogPolicy
{
    public function export(User $user): bool
    {
        return $user->hasRole(['agency_admin', 'super_admin']);
    }
}
