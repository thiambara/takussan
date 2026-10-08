<?php

namespace App\Policies;

use App\Models\PrivacyRequest;
use App\Models\User;

/**
 * TCK-601 (ADR-0044 §4) — le registre des demandes de droits est au super-admin SEUL : il passe par
 * `Gate::before`. Toute autre personne, admin d'agence compris, est refusée ici — et la route vit en
 * outre sous `/api/admin/*` (middleware `super-admin`). Deux portes : une route déplacée demain hors
 * du préfixe garde la sienne.
 */
class PrivacyRequestPolicy
{
    public function viewAny(User $user): bool
    {
        return false;
    }

    public function create(User $user): bool
    {
        return false;
    }

    public function update(User $user, PrivacyRequest $request): bool
    {
        return false;
    }

    public function export(User $user): bool
    {
        return false;
    }
}
