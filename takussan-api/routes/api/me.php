<?php

use App\Http\Controllers\Api\Me\DataExportController;
use App\Http\Controllers\Api\Me\MeController;
use App\Http\Controllers\Api\Me\MeProfilesController;
use App\Http\Controllers\Api\Me\PlatformPayoutController as MePlatformPayoutController;
use App\Http\Controllers\Api\Me\ServiceProviderProfileController as MeServiceProviderProfileController;
use App\Http\Controllers\Api\Me\SubscriptionController;
use App\Http\Controllers\Api\Me\TenantOnboardingChecklistController;
use App\Http\Controllers\WelcomeViewController;
use App\Http\Controllers\WizardDraftController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Me Routes (TCK-141 — Active profile context, TCK-250 — Wizard drafts,
| TCK-251 — Welcome modale tracking)
|--------------------------------------------------------------------------
*/

Route::middleware('auth:sanctum')->prefix('me')->group(function () {
    // TCK-253 — Partial profile update (phone, city, search_intent).
    // Differs from PUT /api/auth/profile which requires first/last name on
    // every call; this endpoint is purely opt-in personalisation.
    Route::patch('/', [MeController::class, 'update'])->name('me.update');

    Route::get('profiles', [MeProfilesController::class, 'index'])->name('me.profiles.index');
    Route::patch('active-profile', [MeProfilesController::class, 'updateActive'])->name('me.active-profile.update');
    Route::get('data-exports', [DataExportController::class, 'index'])->name('me.data-exports.index');
    Route::post('data-exports', [DataExportController::class, 'store'])->name('me.data-exports.store');
    Route::get('subscription', [SubscriptionController::class, 'show'])->name('me.subscription.show');
    Route::get('payouts', [MePlatformPayoutController::class, 'index'])->name('me.payouts.index');

    // TCK-250 — Resumable wizard drafts. `{key}` is a logical identifier owned
    // by the consumer wizard (e.g. `host-individual-wizard`,
    // `owner-onboarding-{invitation_id}`). Strictly user-scoped via the unique
    // `(user_id, key)` index on `wizard_drafts`.
    Route::get('wizard-drafts', [WizardDraftController::class, 'index'])->name('me.wizard-drafts.index');
    Route::get('wizard-drafts/{key}', [WizardDraftController::class, 'show'])
        ->where('key', '[A-Za-z0-9._:-]+')
        ->name('me.wizard-drafts.show');
    Route::put('wizard-drafts/{key}', [WizardDraftController::class, 'upsert'])
        ->where('key', '[A-Za-z0-9._:-]+')
        ->name('me.wizard-drafts.upsert');
    Route::delete('wizard-drafts/{key}', [WizardDraftController::class, 'destroy'])
        ->where('key', '[A-Za-z0-9._:-]+')
        ->name('me.wizard-drafts.destroy');

    // TCK-251 — One-shot welcome modale tracking. `key` is owned by each
    // consumer modale (e.g. `customer-welcome`, `host-welcome`). Strictly
    // user-scoped via the unique `(user_id, key)` index on `welcome_views`.
    Route::get('welcome-seen', [WelcomeViewController::class, 'index'])->name('me.welcome-seen.index');
    Route::post('welcome-seen', [WelcomeViewController::class, 'store'])->name('me.welcome-seen.store');

    // TCK-266 — Espace résident : checklist d'onboarding par bail.
    // Lecture par le tenant lié à `Lease.tenant.user_id` ; complétion d'un
    // item (essentiellement `documents_acknowledged` côté front, les autres
    // sont posés par les listeners/observers ou WelcomeViewController).
    Route::get('leases/{lease}/onboarding-checklist', [TenantOnboardingChecklistController::class, 'show'])
        ->name('me.leases.onboarding-checklist.show');
    Route::post('leases/{lease}/onboarding-checklist/{item}/complete', [TenantOnboardingChecklistController::class, 'complete'])
        ->where('item', '[a-z_]+')
        ->name('me.leases.onboarding-checklist.complete');

    // TCK-261 — wizard-side write endpoints on the freshly-claimed
    // ServiceProviderProfile. Mounted under /api/me/profiles/{sp_profile}
    // so the route signature mirrors the wizard's mental model and
    // ownership checks stay simple (auth user must own the row).
    Route::post('profiles/{sp_profile}/kyc/upload', [MeServiceProviderProfileController::class, 'uploadKyc'])
        ->whereNumber('sp_profile')
        ->middleware('throttle:10,1')
        ->name('me.profiles.sp.kyc.upload');
    Route::patch('profiles/{sp_profile}/trades', [MeServiceProviderProfileController::class, 'updateTrades'])
        ->whereNumber('sp_profile')
        ->name('me.profiles.sp.trades');
    Route::patch('profiles/{sp_profile}/availability', [MeServiceProviderProfileController::class, 'updateAvailability'])
        ->whereNumber('sp_profile')
        ->name('me.profiles.sp.availability');
});
