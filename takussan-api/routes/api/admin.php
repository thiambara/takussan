<?php

use App\Http\Controllers\Api\Admin\AgencyDetailController;
use App\Http\Controllers\Api\Admin\AgencyModerationController;
use App\Http\Controllers\Api\Admin\AgencyOnboardingController;
use App\Http\Controllers\Api\Admin\AgencySubscriptionController;
use App\Http\Controllers\Api\Admin\AgencyUpgradeRequestController;
use App\Http\Controllers\Api\Admin\AlertRuleController;
use App\Http\Controllers\Api\Admin\AnnouncementController;
use App\Http\Controllers\Api\Admin\BusinessEnumController;
use App\Http\Controllers\Api\Admin\CrossTenantAuditController;
use App\Http\Controllers\Api\Admin\DataExportController;
use App\Http\Controllers\Api\Admin\FailedJobController;
use App\Http\Controllers\Api\Admin\FeatureFlagController;
use App\Http\Controllers\Api\Admin\GlobalSearchController;
use App\Http\Controllers\Api\Admin\HealthcheckController;
use App\Http\Controllers\Api\Admin\IntegrationController;
use App\Http\Controllers\Api\Admin\KycController;
use App\Http\Controllers\Api\Admin\MaintenanceController;
use App\Http\Controllers\Api\Admin\ModerationQueueController;
use App\Http\Controllers\Api\Admin\NotificationTemplateController;
use App\Http\Controllers\Api\Admin\PaymentSupervisionController;
use App\Http\Controllers\Api\Admin\PlanController;
use App\Http\Controllers\Api\Admin\PlatformAbilityController;
use App\Http\Controllers\Api\Admin\PlatformPayoutController;
use App\Http\Controllers\Api\Admin\PlatformSettingController;
use App\Http\Controllers\Api\Admin\PrivacyRequestController;
use App\Http\Controllers\Api\Admin\ReportingController;
use App\Http\Controllers\Api\Admin\SchedulerController;
use App\Http\Controllers\Api\Admin\SuperAdminInvitationController;
use App\Http\Controllers\Api\Admin\SystemMetricsController;
use App\Http\Controllers\Api\Admin\UserDetailController;
use App\Http\Controllers\Api\Admin\UserImpersonationController;
use App\Http\Controllers\Api\Admin\UserLifecycleController;
use App\Http\Controllers\Api\Admin\UserSupportController;
use App\Http\Controllers\Api\Admin\WebhookLogController;
use App\Models\Enums\PlatformAbility;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Console plateforme — TCK-144, niveaux d'opérateur TCK-600 (ADR-0047)
|--------------------------------------------------------------------------
| Le middleware `super-admin` laisse ENTRER tout opérateur (PlatformProfile actif, 2FA), et
| refuse au-dessous du `super_admin` toute route qui ne déclare pas de geste. Un geste se
| déclare par GROUPE : `platform-can:<PlatformAbility>`. Une route ajoutée ici sans groupe
| reste donc au `super_admin` — c'est voulu (`PlatformRoutesDefaultDenyTest`).
|
| Any agency-scoped admin capability that should remain accessible to `agency_admin` (property
| moderation queue, booking force-expire, etc.) lives outside this prefix.
*/

$geste = fn (PlatformAbility $ability): string => 'platform-can:'.$ability->value;

Route::middleware(['auth:sanctum', 'super-admin'])->prefix('admin')->group(function () use ($geste) {
    // TCK-600 — les gestes de l'appelant : la console se filtre avec, sans recopier la matrice.
    Route::get('me/abilities', PlatformAbilityController::class)
        ->middleware($geste(PlatformAbility::ConsoleAccess))
        ->name('admin.me.abilities');

    // Agency moderation — list / verify / suspend / unverify (mapped onto
    // AgencyStatus active/suspended/inactive — no `verified_at` column).
    Route::prefix('agencies')->group(function () use ($geste) {
        Route::middleware($geste(PlatformAbility::AgenciesView))->group(function () {
            Route::get('/', [AgencyModerationController::class, 'index'])
                ->name('admin.agencies.index');
            Route::get('{agency}', [AgencyDetailController::class, 'show'])
                ->name('admin.agencies.show');
            Route::get('{agency}/health', [AgencyDetailController::class, 'health'])
                ->name('admin.agencies.health');
            Route::get('{agency}/properties', [AgencyDetailController::class, 'properties'])
                ->name('admin.agencies.properties');
            Route::get('{agency}/subscription', [AgencySubscriptionController::class, 'show'])
                ->name('admin.agencies.subscription.show');
        });
        // Les membres d'une agence sont des données personnelles : `support`, pas `viewer`.
        Route::get('{agency}/team', [AgencyDetailController::class, 'team'])
            ->middleware($geste(PlatformAbility::UsersView))
            ->name('admin.agencies.team');

        Route::post('/', [AgencyOnboardingController::class, 'store'])
            ->name('admin.agencies.store');
        Route::get('{agency}/kyc', [KycController::class, 'agency'])
            ->name('admin.agencies.kyc.show');
        Route::post('{agency}/subscription', [AgencySubscriptionController::class, 'store'])
            ->name('admin.agencies.subscription.store');
        Route::post('{agency}/subscription/cancel', [AgencySubscriptionController::class, 'cancel'])
            ->name('admin.agencies.subscription.cancel');
        Route::post('{agency}/verify', [AgencyModerationController::class, 'verify'])
            ->name('admin.agencies.verify');
        Route::post('{agency}/suspend', [AgencyModerationController::class, 'suspend'])
            ->name('admin.agencies.suspend');
        Route::post('{agency}/reinstate', [AgencyModerationController::class, 'reinstate'])
            ->name('admin.agencies.reinstate');
        Route::post('{agency}/unverify', [AgencyModerationController::class, 'unverify'])
            ->name('admin.agencies.unverify');
    });

    // TCK-268 — Agency upgrade request review console (cross-tenant).
    // pending-count is mounted before the {upgradeRequest} bindings so the
    // sidebar badge endpoint isn't shadowed by the implicit model binding.
    Route::get('agency-upgrade-requests/pending-count', [AgencyUpgradeRequestController::class, 'pendingCount'])
        ->name('admin.agency-upgrade-requests.pending-count');
    Route::get('agency-upgrade-requests', [AgencyUpgradeRequestController::class, 'index'])
        ->name('admin.agency-upgrade-requests.index');
    Route::get('agency-upgrade-requests/{upgradeRequest}', [AgencyUpgradeRequestController::class, 'show'])
        ->name('admin.agency-upgrade-requests.show');
    Route::post('agency-upgrade-requests/{upgradeRequest}/approve', [AgencyUpgradeRequestController::class, 'approve'])
        ->name('admin.agency-upgrade-requests.approve');
    Route::post('agency-upgrade-requests/{upgradeRequest}/reject', [AgencyUpgradeRequestController::class, 'reject'])
        ->name('admin.agency-upgrade-requests.reject');

    // TCK-264 — Peer-to-peer super-admin cooptation. Listing surfaces
    // both active super-admins and pending invitations so the UI can
    // distinguish "Active" / "Awaiting 2FA" / "Invited" without a
    // fan-out call.
    Route::get('super-admins', [SuperAdminInvitationController::class, 'index'])
        ->name('admin.superAdmins.index');
    Route::post('super-admins/invite', [SuperAdminInvitationController::class, 'store'])
        ->name('admin.superAdmins.invite');
    // TCK-367 — cycle de vie de l'invitation de cooptation. Montées sous
    // `super-admins/invitations/*` et non sur les routes génériques
    // `/api/invitations/{id}/*` : la surface super-admin refuse (404) toute
    // invitation qui n'est pas une cooptation, ce que la policy générique
    // — qui autorise l'inviteur ET l'agency_admin de l'agence — ne fait pas.
    Route::post('super-admins/invitations/{invitation}/resend', [SuperAdminInvitationController::class, 'resend'])
        ->name('admin.superAdmins.invitations.resend');
    Route::post('super-admins/invitations/{invitation}/revoke', [SuperAdminInvitationController::class, 'revoke'])
        ->name('admin.superAdmins.invitations.revoke');
    // TCK-600 (ADR-0047 §5) — retirer un opérateur ACTIF (jusque-là : rien, seule une invitation
    // se révoquait). Step-up : `ProtectedActions::STEP_UP`.
    Route::post('super-admins/{user}/revoke', [SuperAdminInvitationController::class, 'revokeOperator'])
        ->name('admin.superAdmins.revoke');

    // TCK-600 (S19) — recherche globale de la console, par la base (`support` et au-dessus).
    Route::get('search', GlobalSearchController::class)
        ->middleware($geste(PlatformAbility::SearchGlobal))
        ->name('admin.search');

    // User support — cross-tenant list/detail (TCK-600 : `support` et au-dessus).
    Route::middleware($geste(PlatformAbility::UsersView))->group(function () {
        Route::get('users', [UserDetailController::class, 'index'])
            ->name('admin.users.index');
        Route::get('users/{user}', [UserDetailController::class, 'show'])
            ->name('admin.users.show');
        Route::get('users/{user}/sessions', [UserDetailController::class, 'sessions'])
            ->name('admin.users.sessions');
        Route::get('users/{user}/activity', [UserDetailController::class, 'activity'])
            ->name('admin.users.activity');
    });
    Route::middleware($geste(PlatformAbility::UsersSupport))->group(function () {
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
    });
    // TCK-600 — cycle de vie d'un compte : bloquer / réactiver (`support`), effacer (`super_admin`).
    Route::middleware($geste(PlatformAbility::UsersBlock))->group(function () {
        Route::post('users/{user}/block', [UserLifecycleController::class, 'block'])
            ->name('admin.users.block');
        Route::post('users/{user}/reactivate', [UserLifecycleController::class, 'reactivate'])
            ->name('admin.users.reactivate');
    });
    Route::post('users/{user}/erase', [UserLifecycleController::class, 'erase'])
        ->name('admin.users.erase');
    Route::post('users/{user}/impersonate', [UserImpersonationController::class, 'start'])
        ->name('admin.users.impersonate');
    Route::post('users/{user}/data-exports', [DataExportController::class, 'store'])
        ->name('admin.users.data-exports.store');
    Route::post('impersonate/stop', [UserImpersonationController::class, 'stop'])
        ->name('admin.impersonate.stop');

    // Cross-tenant KPIs — single endpoint to avoid fan-out.
    Route::get('system/metrics', [SystemMetricsController::class, 'index'])
        ->middleware($geste(PlatformAbility::ReportsView))
        ->name('admin.system.metrics');
    Route::middleware($geste(PlatformAbility::HealthView))->group(function () {
        Route::get('health', HealthcheckController::class)->name('admin.health');
        Route::get('scheduler', SchedulerController::class)->name('admin.scheduler');
    });
    Route::get('jobs/failed', [FailedJobController::class, 'index'])->name('admin.jobs.failed.index');
    Route::get('jobs/failed/{id}', [FailedJobController::class, 'show'])->name('admin.jobs.failed.show');
    Route::post('jobs/failed/{id}/retry', [FailedJobController::class, 'retry'])->name('admin.jobs.failed.retry');
    Route::post('jobs/failed/retry-all', [FailedJobController::class, 'retryAll'])->name('admin.jobs.failed.retry-all');
    Route::delete('jobs/failed/{id}', [FailedJobController::class, 'destroy'])->name('admin.jobs.failed.destroy');

    // Cross-tenant audit log — no agency restriction (unlike AuditLogController).
    Route::get('audit', [CrossTenantAuditController::class, 'index'])
        ->name('admin.audit.index');
    // TCK-601 (F) — même filtres que l'index (`filter[sensitive]=1` compris), CSV par lien signé.
    Route::get('audit/export', [CrossTenantAuditController::class, 'export'])
        ->name('admin.audit.export');

    // TCK-601 (G, ADR-0044 §4) — registre des demandes de droits. `export` avant `{privacyRequest}`.
    Route::get('privacy-requests', [PrivacyRequestController::class, 'index'])->name('admin.privacy-requests.index');
    Route::post('privacy-requests', [PrivacyRequestController::class, 'store'])->name('admin.privacy-requests.store');
    Route::get('privacy-requests/export', [PrivacyRequestController::class, 'export'])->name('admin.privacy-requests.export');
    Route::patch('privacy-requests/{privacyRequest}', [PrivacyRequestController::class, 'update'])->name('admin.privacy-requests.update');

    // TCK-600 — `support` LIT la file ; décider reste au `super_admin` (TCK-597 possède la file).
    Route::get('moderation', [ModerationQueueController::class, 'index'])
        ->middleware($geste(PlatformAbility::ModerationView))
        ->name('admin.moderation.index');
    // TCK-597 — déclarée AVANT `moderation/{id}/…` : `{id}` accepte tout (`.+`).
    Route::post('moderation/decide-batch', [ModerationQueueController::class, 'decideBatch'])
        ->name('admin.moderation.decide-batch');
    Route::post('moderation/{id}/claim', [ModerationQueueController::class, 'claim'])
        ->where('id', '.+')
        ->name('admin.moderation.claim');
    Route::delete('moderation/{id}/claim', [ModerationQueueController::class, 'release'])
        ->where('id', '.+')
        ->name('admin.moderation.release');
    Route::post('moderation/{id}/decide', [ModerationQueueController::class, 'decide'])
        ->where('id', '.+')
        ->name('admin.moderation.decide');

    Route::get('kyc', [KycController::class, 'index'])->name('admin.kyc.index');
    Route::get('kyc/{dossier}', [KycController::class, 'show'])->name('admin.kyc.show');
    Route::post('kyc/{dossier}/verify', [KycController::class, 'verify'])->name('admin.kyc.verify');
    Route::post('kyc/{dossier}/reject', [KycController::class, 'reject'])->name('admin.kyc.reject');

    Route::get('enums', [BusinessEnumController::class, 'index'])->name('admin.enums.index');
    Route::get('enums/{key}', [BusinessEnumController::class, 'show'])->name('admin.enums.show');
    Route::post('enums/{key}/values', [BusinessEnumController::class, 'storeValue'])->name('admin.enums.values.store');
    Route::patch('enums/{key}/values/{value}', [BusinessEnumController::class, 'updateValue'])->name('admin.enums.values.update');
    Route::delete('enums/{key}/values/{value}', [BusinessEnumController::class, 'deactivateValue'])->name('admin.enums.values.destroy');

    Route::get('plans', [PlanController::class, 'index'])->name('admin.plans.index');
    Route::post('plans', [PlanController::class, 'store'])->name('admin.plans.store');
    Route::patch('plans/{plan}', [PlanController::class, 'update'])->name('admin.plans.update');
    Route::delete('plans/{plan}', [PlanController::class, 'destroy'])->name('admin.plans.destroy');

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

    // TCK-602 (ADR-0051) — le journal des webhooks entrants, et son rejeu (geste sensible : step-up).
    Route::get('webhook-logs', [WebhookLogController::class, 'index'])->name('admin.webhook-logs.index');
    Route::get('webhook-logs/{webhookLog}', [WebhookLogController::class, 'show'])->name('admin.webhook-logs.show');
    Route::post('webhook-logs/{webhookLog}/replay', [WebhookLogController::class, 'replay'])->name('admin.webhook-logs.replay');

    // TCK-602 — la console « Paiements » : le littéral avant toute route paramétrée.
    Route::get('payments/summary', [PaymentSupervisionController::class, 'summary'])->name('admin.payments.summary');
    Route::get('payments', [PaymentSupervisionController::class, 'index'])->name('admin.payments.index');

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

    // TCK-227 — Cross-tenant reporting (read-only). TCK-600 : tout niveau.
    Route::middleware($geste(PlatformAbility::ReportsView))->group(function () {
        Route::get('reports/growth', [ReportingController::class, 'growth'])->name('admin.reports.growth');
        Route::get('reports/revenue', [ReportingController::class, 'revenue'])->name('admin.reports.revenue');
        Route::get('reports/cohorts', [ReportingController::class, 'cohorts'])->name('admin.reports.cohorts');
        Route::get('reports/funnel', [ReportingController::class, 'funnel'])->name('admin.reports.funnel');
        Route::get('reports/{report}/export', [ReportingController::class, 'export'])->name('admin.reports.export');
    });

    // TCK-223 — Platform → agency payouts. close-period must come before
    // {payout} bindings to avoid the slug being interpreted as an id.
    Route::get('payouts', [PlatformPayoutController::class, 'index'])->name('admin.payouts.index');
    Route::post('payouts/close-period', [PlatformPayoutController::class, 'closePeriod'])->name('admin.payouts.close-period');
    Route::get('payouts/{payout}', [PlatformPayoutController::class, 'show'])->name('admin.payouts.show');
    Route::post('payouts/{payout}/approve', [PlatformPayoutController::class, 'approve'])->name('admin.payouts.approve');
    Route::post('payouts/{payout}/mark-paid', [PlatformPayoutController::class, 'markPaid'])->name('admin.payouts.mark-paid');
    Route::post('payouts/{payout}/cancel', [PlatformPayoutController::class, 'cancel'])->name('admin.payouts.cancel');
});
