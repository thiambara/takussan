<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\User;

class ActivityLogPolicy
{
    /**
     * TCK-2260 (P116.07, ADR-0003, amendement du 2026-10-24) — le journal d'audit de l'agence (liste,
     * historique d'un objet) : l'admin de l'agence ET `reports.view_agency` à cette agence, comme les
     * autres chiffres de l'agence. Le prédicat était recopié dans `AuditLogController` et
     * `IndexAuditLogRequest` ; ils l'appellent. Le super-admin passe ici et par `Gate::before`.
     */
    public function viewAny(User $user): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        $agencyId = $user->agency_id;
        if ($agencyId === null || ! $user->isAgencyAdminAt((int) $agencyId)) {
            return false;
        }

        $agency = Agency::query()->find($agencyId);

        return $agency !== null && $user->canActAt(Capability::ReportsViewAgency, $agency);
    }

    public function export(User $user): bool
    {
        return $this->viewAny($user);
    }
}
