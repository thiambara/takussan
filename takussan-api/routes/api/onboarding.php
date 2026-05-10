<?php

use App\Http\Controllers\HostOnboardingController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Onboarding Routes (TCK-255 — host individual wizard)
|--------------------------------------------------------------------------
*/

Route::middleware('auth:sanctum')->group(function () {
    // TCK-255 — single transactional endpoint that creates the
    // individual agency, the AgencyAdminProfile (deferred to TCK-271 —
    // currently materialized as a spatie role only) + OwnerProfile and
    // the first property draft. The wizard at `/onboarding/host` PUTs
    // its draft to `/api/me/wizard-drafts/host-individual-wizard` step
    // by step and POSTs to this endpoint on completion.
    Route::post('host/individual/onboard', [HostOnboardingController::class, 'individual'])
        ->name('host.individual.onboard')
        ->middleware('throttle:5,1');
});
