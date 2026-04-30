<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\User;

class BankStatementPolicy
{
    public function viewAny(User $user, Agency $agency): bool
    {
        return $user->agency_id === $agency->id
            && ($user->id === $agency->primary_admin_id || $user->hasRole(['agency_admin']));
    }

    public function view(User $user, BankStatement $statement): bool
    {
        return $this->viewAny($user, $statement->agency);
    }

    public function create(User $user, Agency $agency): bool
    {
        return $this->viewAny($user, $agency);
    }

    public function finalize(User $user, BankStatement $statement): bool
    {
        return $this->viewAny($user, $statement->agency);
    }
}
