<?php

use App\Http\Controllers\Api\Admin\AgencyDetailController;
use App\Http\Controllers\Api\Admin\AgencyModerationController;
use App\Http\Controllers\Api\Admin\AgencyOnboardingController;
use App\Http\Controllers\Api\Admin\AlertRuleController;
use App\Http\Controllers\Api\Admin\AnnouncementController;
use App\Http\Controllers\Api\Admin\BusinessEnumController;
use App\Http\Controllers\Api\Admin\CrossTenantAuditController;
use App\Http\Controllers\Api\Admin\DataExportController;
use App\Http\Controllers\Api\Admin\FeatureFlagController;
use App\Http\Controllers\Api\Admin\IntegrationController;
use App\Http\Controllers\Api\Admin\MaintenanceController;
use App\Http\Controllers\Api\Admin\ModerationQueueController;
use App\Http\Controllers\Api\Admin\NotificationTemplateController;
use App\Http\Controllers\Api\Admin\PlatformSettingController;
use App\Http\Controllers\Api\Admin\SystemMetricsController;
use App\Http\Controllers\Api\Admin\UserDetailController;
use App\Http\Controllers\Api\Admin\UserImpersonationController;
use App\Http\Controllers\Api\Admin\UserSupportController;
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
        Route::post('/', [AgencyOnboardingController::class, 'store'])
            ->name('admin.agencies.store');
        Route::get('{agency}', [AgencyDetailController::class, 'show'])
            ->name('admin.agencies.show');
        Route::get('{agency}/health', [AgencyDetailController::class, 'health'])
            ->name('admin.agencies.health');
        Route::get('{agency}/team', [AgencyDetailController::class, 'team'])
            ->name('admin.agencies.team');
        Route::get('{agency}/properties', [AgencyDetailController::class, 'properties'])
            ->name('admin.agencies.properties');
        Route::post('{agency}/verify', [AgencyModerationController::class, 'verify'])
            ->name('admin.agencies.verify');
        Route::post('{agency}/suspend', [AgencyModerationController::class, 'suspend'])
            ->name('admin.agencies.suspend');
        Route::post('{agency}/unverify', [AgencyModerationController::class, 'unverify'])
            ->name('admin.agencies.unverify');
    });

    // User impersonation — short-lived Sanctum token (≤ 1h, name=impersonation).
    Route::get('users/{user}', [UserDetailController::class, 'show'])
        ->name('admin.users.show');
    Route::get('users/{user}/sessions', [UserDetailController::class, 'sessions'])
        ->name('admin.users.sessions');
    Route::get('users/{user}/activity', [UserDetailController::class, 'activity'])
        ->name('admin.users.activity');
    Route::post('users/{user}/force-password-reset', [UserSupportController::class, 'forcePasswordReset'])
        ->name('admin.users.force-password-reset');
    Route::post('users/{user}/unlock', [UserSupportController::class, 'unlock'])
        ->name('admin.users.unlock');
    Route::post('users/{user}/reset-2fa', [UserSupportController::class, 'reset2fa'])
        ->name('admin.users.reset-2fa');
    Route::post('users/{user}/revoke-sessions', [UserSupportController::class, 'revokeSessions'])
        ->name('admin.users.revoke-sessions');
    Route::delete('users/{user}/sessions/{tokenId}', [UserSupportController::class, 'destroySession'])
        ->name('admin.users.sessions.destroy');
    Route::post('users/{user}/impersonate', [UserImpersonationController::class, 'start'])
        ->name('admin.users.impersonate');
    Route::post('users/{user}/data-exports', [DataExportController::class, 'store'])
        ->name('admin.users.data-exports.store');
    Route::post('impersonate/stop', [UserImpersonationController::class, 'stop'])
        ->name('admin.impersonate.stop');

    // Cross-tenant KPIs — single endpoint to avoid fan-out.
    Route::get('system/metrics', [SystemMetricsController::class, 'index'])
        ->name('admin.system.metrics');

    // Cross-tenant audit log — no agency restriction (unlike AuditLogController).
    Route::get('audit', [CrossTenantAuditController::class, 'index'])
        ->name('admin.audit.index');

    Route::get('moderation', [ModerationQueueController::class, 'index'])
        ->name('admin.moderation.index');
    Route::post('moderation/{id}/decide', [ModerationQueueController::class, 'decide'])
        ->where('id', '.+')
        ->name('admin.moderation.decide');

    Route::get('enums', [BusinessEnumController::class, 'index'])->name('admin.enums.index');
    Route::get('enums/{key}', [BusinessEnumController::class, 'show'])->name('admin.enums.show');
    Route::post('enums/{key}/values', [BusinessEnumController::class, 'storeValue'])->name('admin.enums.values.store');
    Route::patch('enums/{key}/values/{value}', [BusinessEnumController::class, 'updateValue'])->name('admin.enums.values.update');
    Route::delete('enums/{key}/values/{value}', [BusinessEnumController::class, 'deactivateValue'])->name('admin.enums.values.destroy');

    Route::get('notification-templates', [NotificationTemplateController::class, 'index'])->name('admin.notification-templates.index');
    Route::get('notification-templates/{event}/{channel}', [NotificationTemplateController::class, 'show'])->name('admin.notification-templates.show');
    Route::patch('notification-templates/{event}/{channel}', [NotificationTemplateController::class, 'update'])->name('admin.notification-templates.update');
    Route::post('notification-templates/{event}/{channel}/preview', [NotificationTemplateController::class, 'preview'])->name('admin.notification-templates.preview');

    Route::get('settings', [PlatformSettingController::class, 'index'])->name('admin.settings.index');
    Route::patch('settings', [PlatformSettingController::class, 'bulkUpdate'])->name('admin.settings.update');

    Route::get('integrations', [IntegrationController::class, 'index'])->name('admin.integrations.index');
    Route::get('integrations/{integration}/schema', [IntegrationController::class, 'schema'])->name('admin.integrations.schema');
    Route::get('integrations/{integration}/webhooks', [IntegrationController::class, 'webhooks'])->name('admin.integrations.webhooks');
    Route::post('integrations/{integration}/test', [IntegrationController::class, 'test'])->name('admin.integrations.test');
    Route::get('integrations/{integration}', [IntegrationController::class, 'show'])->name('admin.integrations.show');
    Route::patch('integrations/{integration}', [IntegrationController::class, 'update'])->name('admin.integrations.update');

    Route::get('maintenance', [MaintenanceController::class, 'show'])->name('admin.maintenance.show');
    Route::post('maintenance', [MaintenanceController::class, 'store'])->name('admin.maintenance.store');
    Route::delete('maintenance', [MaintenanceController::class, 'destroy'])->name('admin.maintenance.destroy');

    Route::get('feature-flags', [FeatureFlagController::class, 'index'])->name('admin.feature-flags.index');
    Route::patch('feature-flags/{key}', [FeatureFlagController::class, 'update'])->name('admin.feature-flags.update');
    Route::post('feature-flags/{key}/override', [FeatureFlagController::class, 'override'])->name('admin.feature-flags.override');

    Route::get('alert-rules', [AlertRuleController::class, 'index'])->name('admin.alert-rules.index');
    Route::post('alert-rules', [AlertRuleController::class, 'store'])->name('admin.alert-rules.store');
    Route::patch('alert-rules/{alertRule}', [AlertRuleController::class, 'update'])->name('admin.alert-rules.update');
    Route::delete('alert-rules/{alertRule}', [AlertRuleController::class, 'destroy'])->name('admin.alert-rules.destroy');
    Route::post('alert-rules/{alertRule}/test', [AlertRuleController::class, 'test'])->name('admin.alert-rules.test');

    Route::get('announcements', [AnnouncementController::class, 'index'])->name('admin.announcements.index');
    Route::post('announcements', [AnnouncementController::class, 'store'])->name('admin.announcements.store');
    Route::patch('announcements/{announcement}', [AnnouncementController::class, 'update'])->name('admin.announcements.update');
    Route::post('announcements/{announcement}/deactivate', [AnnouncementController::class, 'deactivate'])->name('admin.announcements.deactivate');
});
