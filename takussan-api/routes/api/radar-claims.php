<?php

use App\Http\Controllers\Public\RadarClaimController;
use App\Services\Radar\ClaimLinks;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Radar — la réclamation par l'annonceur, TCK-2390 (ADR-0077 §3)
|--------------------------------------------------------------------------
| Public, SANS `auth` : le lien signé du message est l'autorisation, et il ne donne que ceci — lire SES annonces, recevoir
| un code à SON numéro, les publier. Chaque route sous son propre compteur par IP ; l'envoi du code porte en plus la borne
| par IP de la connexion par téléphone (`auth-phone-send`) et, dans le service, celle par numéro (`PhoneSendQuota`) ; la
| confirmation partage le seau par numéro de `auth-phone-verify` (le numéro de l'annonceur, lu dans le jeton).
*/

Route::prefix('radar/claims/{token}')
    ->where(['token' => ClaimLinks::TOKEN_PATTERN])
    ->group(function (): void {
        Route::get('/', [RadarClaimController::class, 'show'])
            ->middleware('throttle:30,1,radar_claim_show')
            ->name('radar.claims.show');
        Route::post('otp', [RadarClaimController::class, 'otp'])
            ->middleware(['throttle:6,1,radar_claim_otp', 'throttle:auth-phone-send'])
            ->name('radar.claims.otp');
        Route::post('confirm', [RadarClaimController::class, 'confirm'])
            ->middleware(['throttle:10,1,radar_claim_confirm', 'throttle:auth-phone-verify'])
            ->name('radar.claims.confirm');
    });
