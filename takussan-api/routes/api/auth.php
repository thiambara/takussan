<?php

use App\Http\Controllers\Api\Auth\AccountDeletionController;
use App\Http\Controllers\Api\Auth\AppleOAuthController;
use App\Http\Controllers\Api\Auth\FacebookOAuthController;
use App\Http\Controllers\Api\Auth\SuperAdminTwoFactorController;
use App\Http\Controllers\Api\UserAdminController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\EmailVerificationController;
use App\Http\Controllers\Auth\OAuthController;
use App\Http\Controllers\Auth\OAuthProviderController;
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
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:auth-register');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,10');

    Route::post('/forgot-password', [PasswordResetController::class, 'forgotPassword'])
        ->middleware('throttle:auth-password')
        ->name('password.email');
    Route::post('/reset-password', [PasswordResetController::class, 'resetPassword'])
        ->middleware('throttle:auth-password')
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
        ->middleware('signed:relative')
        ->name('verification.verify');
    Route::post('/email/resend', [EmailVerificationController::class, 'resend'])
        ->middleware('throttle:6,1')
        ->name('verification.send');

    // Phone verification
    // OTP entry is rate-limited to curb brute force on the 6-digit code
    // (1 000 000 combinations — at 5/min an attacker would still need
    // ~3 800 hours on average, further capped by the 5-min TTL of each
    // OTP).
    Route::post('/verify-phone', [PhoneVerificationController::class, 'verify'])->middleware('throttle:5,1');
    Route::post('/phone/verify-otp', [PhoneVerificationController::class, 'verify'])->middleware('throttle:5,1');
    Route::post('/phone/send-otp', [PhoneVerificationController::class, 'resend'])->middleware('throttle:3,1');
    Route::post('/phone/resend', [PhoneVerificationController::class, 'resend'])->middleware('throttle:3,1');

    // Two-factor authentication
    // /confirm and /disable both gate on a 6-digit TOTP (or password on
    // /disable). Without throttling, an attacker with a stolen session
    // cookie could brute-force the 10^6 keyspace in minutes — TOTP's
    // ±30 s window extends the valid range and makes this realistic.
    Route::post('/two-factor/enable', [TwoFactorController::class, 'enable']);
    // TCK-078 — QR as inline SVG, replaces api.qrserver.com.
    Route::get('/two-factor/qr', [TwoFactorController::class, 'qr']);
    Route::post('/two-factor/confirm', [TwoFactorController::class, 'confirm'])->middleware('throttle:5,1');
    Route::post('/two-factor/disable', [TwoFactorController::class, 'disable'])->middleware('throttle:5,1');
    Route::get('/two-factor/recovery-codes', [TwoFactorController::class, 'recoveryCodes']);
    Route::post('/two-factor/recovery-codes/regenerate', [TwoFactorController::class, 'regenerateRecoveryCodes']);

    // TCK-264 — Mandatory TOTP enrollment for a freshly-coopted
    // super-admin. The spatie role is deferred until /confirm flips
    // it on, so these endpoints accept *only* users with
    // `force_2fa_at_first_login = true`.
    Route::post('/super-admin/2fa/enroll', [SuperAdminTwoFactorController::class, 'enroll'])
        ->name('auth.super-admin.2fa.enroll');
    Route::post('/super-admin/2fa/confirm', [SuperAdminTwoFactorController::class, 'confirm'])
        ->middleware('throttle:5,1')
        ->name('auth.super-admin.2fa.confirm');

    // Session management
    Route::get('/sessions', [SessionController::class, 'index']);
    Route::delete('/sessions/{tokenId}', [SessionController::class, 'destroy']);

    // TCK-080 — RGPD self-service account deletion (request → grace → execute).
    // Creating a request revokes ALL Sanctum tokens, so the throttle on POST
    // is generous; DELETE/GET stay on the default API throttle.
    Route::get('/me/deletion-request', [AccountDeletionController::class, 'show']);
    // TCK-272 — émission du code e-mail de step-up pour les comptes sans mot
    // de passe utilisable. Déclarée AVANT `/me/deletion-request` par respect
    // de la convention du fichier (littéral d'abord) même si aucune des deux
    // n'est paramétrée. Limiteur NOMMÉ : il n'y a pas de `throttle:api`
    // global, et un envoi d'e-mail non borné est un canal d'abus.
    Route::post('/me/deletion-request/step-up', [AccountDeletionController::class, 'sendStepUpCode'])
        ->middleware('throttle:account-deletion-step-up');
    Route::post('/me/deletion-request', [AccountDeletionController::class, 'store'])
        ->middleware('throttle:5,10');
    Route::delete('/me/deletion-request', [AccountDeletionController::class, 'destroy']);
});

// OAuth (public — SPA flow, state stored server-side via Cache).
// Throttled: redirect creates a 10-min cache entry per hit, and callback
// brute-forcing random state strings would otherwise be free. 60/min per
// IP mirrors Laravel's default API throttle and leaves plenty of room
// for retries while blocking cheap enumeration.
Route::prefix('auth/oauth')->middleware('throttle:60,1')->group(function () {
    Route::get('/providers', OAuthProviderController::class);

    // Dedicated Facebook/Apple controllers (TCK-081) — declared before the
    // generic `{provider}` route so Laravel matches them first.
    Route::get('/facebook/redirect', [FacebookOAuthController::class, 'redirect']);
    Route::get('/facebook/callback', [FacebookOAuthController::class, 'callback']);
    Route::get('/apple/redirect', [AppleOAuthController::class, 'redirect']);
    // Apple returns the callback via `response_mode=form_post` → POST.
    // We still accept GET for parity with the other providers and local tests.
    Route::match(['get', 'post'], '/apple/callback', [AppleOAuthController::class, 'callback']);

    // Legacy / generic OAuth (TCK-060 — currently only Google). Kept as
    // the parametric fallback to preserve the original URL contract
    // while Facebook/Apple are routed to their dedicated controllers.
    Route::get('/{provider}/redirect', [OAuthController::class, 'redirect'])
        ->whereIn('provider', ['google']);
    Route::get('/{provider}/callback', [OAuthController::class, 'callback'])
        ->whereIn('provider', ['google']);
});
