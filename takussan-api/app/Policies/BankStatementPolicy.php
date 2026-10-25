<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Enums\Capability;
use App\Models\User;

class BankStatementPolicy
{
    /**
     * TCK-2260 (P116.07, ADR-0003, amendement du 2026-10-24) — le rapprochement bancaire : l'admin
     * de l'agence ET `payments.reconcile` à cette agence, l'admin principal passant (il ne s'en
     * enferme pas dehors), comme {@see AgencyPolicy::configure()}. Lue par les quatre gestes (liste,
     * détail, import, clôture), les lignes, le mapping CSV et la recherche de paiements.
     */
    public function viewAny(User $user, Agency $agency): bool
    {
        if ($user->agency_id !== $agency->id) {
            return false;
        }

        if ($user->id === $agency->primary_admin_id) {
            return true;
        }

        return $user->isAgencyAdminAt((int) $agency->id)
            && $user->canActAt(Capability::PaymentsReconcile, $agency);
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
