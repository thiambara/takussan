<?php

use App\Http\Controllers\Api\Me\DataExportController;
use App\Http\Controllers\Api\Me\MeProfilesController;
use App\Http\Controllers\Api\Me\PlatformPayoutController as MePlatformPayoutController;
use App\Http\Controllers\Api\Me\SubscriptionController;
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
});
