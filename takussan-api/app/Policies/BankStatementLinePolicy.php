<?php

namespace App\Policies;

use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\User;

class BankStatementLinePolicy
{
    public function viewAny(User $user, BankStatement $statement): bool
    {
        return app(BankStatementPolicy::class)->view($user, $statement);
    }

    public function match(User $user, BankStatementLine $line): bool
    {
        return $this->viewAny($user, $line->statement)
            && ! $line->statement->status->isClosed();
    }

    public function unmatch(User $user, BankStatementLine $line): bool
    {
        return $this->match($user, $line);
    }

    public function ignore(User $user, BankStatementLine $line): bool
    {
        return $this->match($user, $line);
    }
}
