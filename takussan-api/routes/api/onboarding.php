<?php

use App\Http\Controllers\AgentOnboardingController;
use App\Http\Controllers\HostOnboardingController;
use App\Http\Controllers\OwnerOnboardingController;
use App\Http\Controllers\ServiceProviderOnboardingController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Onboarding Routes (TCK-255 — host individual wizard, TCK-257 — owner
| wizard, TCK-261 — SP wizard)
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

    // TCK-261 — finalize the post-acceptance Service Provider wizard.
    // Trades, zones, KYC and availability are persisted upstream by the
    // dedicated /api/me/profiles/{sp_profile}/* endpoints; this one
    // gates the OTP, flips status + collaborations and pins the active
    // profile cookie.
    Route::post('service-provider/onboard/complete', [ServiceProviderOnboardingController::class, 'complete'])
        ->name('service-provider.onboard.complete')
        ->middleware('throttle:5,1');

    // TCK-257 — finalize the post-acceptance Owner wizard. KYC docs are
    // persisted upstream by the dedicated /api/me/profiles/{owner_profile}/*
    // endpoints; this one gates the OTP, flips OwnerProfile status to
    // active and pins the active profile cookie.
    Route::post('owner/onboard/complete', [OwnerOnboardingController::class, 'complete'])
        ->name('owner.onboard.complete')
        ->middleware('throttle:5,1');

    // TCK-259 — finalize the post-acceptance Agent wizard. KYC docs,
    // specialization and intervention zones are persisted upstream by
    // the dedicated /api/me/agent-profiles/{agent_profile}/* endpoints ;
    // this one gates the OTP, flips AgentProfile status to active and
    // pins the active profile cookie.
    Route::post('agent/onboard/complete', [AgentOnboardingController::class, 'complete'])
        ->name('agent.onboard.complete')
        ->middleware('throttle:5,1');
});
