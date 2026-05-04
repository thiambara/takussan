<?php

use App\Http\Controllers\Api\Admin\AgencyModerationController;
use App\Http\Controllers\Api\Admin\CrossTenantAuditController;
use App\Http\Controllers\Api\Admin\SystemMetricsController;
use App\Http\Controllers\Api\Admin\UserImpersonationController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Super-admin routes — TCK-144
|--------------------------------------------------------------------------
| Strictly super_admin-only namespace. The `super-admin` middleware probes
| `hasRole('super_admin')` under `team_id = null`. Any agency-scoped admin
| capability that should remain accessible to `agency_admin` (property
| moderation queue, booking force-expire, etc.) lives outside this prefix.
*/

Route::middleware(['auth:sanctum', 'super-admin'])->prefix('admin')->group(function () {
    // Agency moderation — list / verify / suspend / unverify (mapped onto
    // AgencyStatus active/suspended/inactive — no `verified_at` column).
    Route::prefix('agencies')->group(function () {
        Route::get('/', [AgencyModerationController::class, 'index'])
            ->name('admin.agencies.index');
        Route::post('{agency}/verify', [AgencyModerationController::class, 'verify'])
            ->name('admin.agencies.verify');
        Route::post('{agency}/suspend', [AgencyModerationController::class, 'suspend'])
            ->name('admin.agencies.suspend');
        Route::post('{agency}/unverify', [AgencyModerationController::class, 'unverify'])
            ->name('admin.agencies.unverify');
    });

    // User impersonation — short-lived Sanctum token (≤ 1h, name=impersonation).
    Route::post('users/{user}/impersonate', [UserImpersonationController::class, 'start'])
        ->name('admin.users.impersonate');
    Route::post('impersonate/stop', [UserImpersonationController::class, 'stop'])
        ->name('admin.impersonate.stop');

    // Cross-tenant KPIs — single endpoint to avoid fan-out.
    Route::get('system/metrics', [SystemMetricsController::class, 'index'])
        ->name('admin.system.metrics');

    // Cross-tenant audit log — no agency restriction (unlike AuditLogController).
    Route::get('audit', [CrossTenantAuditController::class, 'index'])
        ->name('admin.audit.index');
});
