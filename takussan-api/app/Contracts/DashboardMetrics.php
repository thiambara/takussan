<?php

namespace App\Contracts;

use App\Models\User;

/**
 * Adapter contract used by GET /api/dashboard/me to render a single
 * role-scoped payload. Implementations wrap the per-role
 * App\Services\Dashboard\Dashboard*Service::summary() output and expose
 * a flat metrics map plus the section identifiers the frontend should mount.
 */
interface DashboardMetrics
{
    /**
     * Identifier consumed by the frontend to switch dashboard variants.
     * Expected values: agency_admin, agent, owner, tenant.
     */
    public function role(): string;

    /**
     * Flat metric map (key => scalar | array). Keys are stable contract
     * surface — see TCK-032 contract section for the per-role layout.
     *
     * @return array<string, mixed>
     */
    public function metrics(User $user): array;

    /**
     * Section identifiers (e.g. "portfolio", "revenue") used by the
     * frontend to mount widgets in the correct order.
     *
     * @return list<string>
     */
    public function sections(User $user): array;
}
