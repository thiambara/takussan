<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\Enums\Capability;

/**
 * TCK-587 (ADR-0031 §2) — suspendre / réactiver un membre de l'agence de la route.
 *
 * `team.suspend` dans l'agence de la route, qui doit être celle du profil actif de l'appelant —
 * et dont il est PERSONNEL : on ne suspend pas dans une agence où l'on n'agit pas.
 */
class SuspendTeamMemberRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $agency = $this->route('agency');

        if ($user === null || ! $agency instanceof Agency) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        return $user->staffAgencyId() === (int) $agency->id
            && $user->canActAt(Capability::TeamSuspend, $agency);
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [];
    }
}
