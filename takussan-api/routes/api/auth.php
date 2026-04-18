<?php

use App\Http\Controllers\Api\UserAdminController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\EmailVerificationController;
use App\Http\Controllers\Auth\OAuthController;
use App\Http\Controllers\Auth\PasswordResetController;
use App\Http\Controllers\Auth\PhoneVerificationController;
use App\Http\Controllers\Auth\SessionController;
use App\Http\Controllers\Auth\TwoFactorController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Auth Routes (P0)
|--------------------------------------------------------------------------
*/

// Public routes
Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,10');

    Route::post('/forgot-password', [PasswordResetController::class, 'forgotPassword'])
        ->name('password.email');
    Route::post('/reset-password', [PasswordResetController::class, 'resetPassword'])
        ->name('password.update');
});

// Authenticated routes
Route::prefix('auth')->middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::put('/profile', [AuthController::class, 'updateProfile']);
    Route::delete('/account', [UserAdminController::class, 'deleteOwnAccount'])->name('auth.account.destroy');

    // Email verification
    Route::get('/verify-email/{id}/{hash}', [EmailVerificationController::class, 'verify'])
        ->middleware('signed')
        ->name('verification.verify');
    Route::post('/email/resend', [EmailVerificationController::class, 'resend'])
        ->middleware('throttle:6,1')
        ->name('verification.send');

    // Phone verification
    Route::post('/verify-phone', [PhoneVerificationController::class, 'verify']);
    Route::post('/phone/resend', [PhoneVerificationController::class, 'resend'])->middleware('throttle:3,1');

    // Two-factor authentication
    Route::post('/two-factor/enable', [TwoFactorController::class, 'enable']);
    Route::post('/two-factor/confirm', [TwoFactorController::class, 'confirm']);
    Route::post('/two-factor/disable', [TwoFactorController::class, 'disable']);
    Route::get('/two-factor/recovery-codes', [TwoFactorController::class, 'recoveryCodes']);

    // Session management
    Route::get('/sessions', [SessionController::class, 'index']);
    Route::delete('/sessions/{tokenId}', [SessionController::class, 'destroy']);
});

// OAuth (public — redirect URL returned as JSON for SPA)
Route::prefix('auth')->group(function () {
    Route::get('/oauth/google/redirect', [OAuthController::class, 'redirectToGoogle']);
    Route::get('/oauth/google/callback', [OAuthController::class, 'handleGoogleCallback']);
});
