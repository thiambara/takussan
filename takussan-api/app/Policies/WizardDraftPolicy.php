<?php

namespace App\Policies;

use App\Models\User;
use App\Models\WizardDraft;

/**
 * TCK-250 — Owner-scoped policy for resumable wizard drafts.
 *
 * Drafts are strictly per-user. `super_admin` bypass still applies via the
 * global `Gate::before` hook, but no agency/team logic is involved here:
 * a draft belongs to a single user, period.
 */
class WizardDraftPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, WizardDraft $draft): bool
    {
        return $draft->user_id === $user->id;
    }

    public function update(User $user, WizardDraft $draft): bool
    {
        return $draft->user_id === $user->id;
    }

    public function delete(User $user, WizardDraft $draft): bool
    {
        return $draft->user_id === $user->id;
    }
}
