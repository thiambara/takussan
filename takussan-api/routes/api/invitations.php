<?php

use App\Http\Controllers\Api\InvitationController;
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
    Route::post('invitations', [InvitationController::class, 'store'])->name('invitations.store');
    Route::get('invitations/{invitation}', [InvitationController::class, 'show'])->name('invitations.show');
    Route::post('invitations/{invitation}/revoke', [InvitationController::class, 'revoke'])->name('invitations.revoke');
    Route::post('invitations/{invitation}/resend', [InvitationController::class, 'resend'])->name('invitations.resend');
});
