<?php

use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\InvitationPrefillController;
use App\Http\Controllers\Public\InvitationAcceptController;
use Illuminate\Support\Facades\Route;

// TCK-249 — Public accept endpoint. Mounted outside the auth:sanctum
// group so unauthenticated invitees can complete onboarding directly
// from the email link. The token in the URL is the bearer credential.
// Note: the controller still calls $request->user() optionally so that
// authenticated callers (existing-user branch after login) hit the same
// route.
Route::post('invitations/{token}/accept', InvitationAcceptController::class)
    ->name('invitations.accept');

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('invitations', [InvitationController::class, 'index'])->name('invitations.index');
    // P208.01 (TCK-2190) — plus de création générique : les routes par rôle
    // (`routes/api/agencies.php`) et la cooptation (`routes/api/admin.php`) émettent.
    Route::get('invitations/{invitation}', [InvitationController::class, 'show'])->name('invitations.show');
    // P220.07 (TCK-2281) — le nom de l'invitation, à préremplir pour un compte connecté sans nom.
    Route::get('invitations/{token}/prefill', InvitationPrefillController::class)->name('invitations.prefill');
    Route::post('invitations/{invitation}/revoke', [InvitationController::class, 'revoke'])->name('invitations.revoke');
    Route::post('invitations/{invitation}/resend', [InvitationController::class, 'resend'])
        ->middleware('throttle:invitations-send')->name('invitations.resend');
});
