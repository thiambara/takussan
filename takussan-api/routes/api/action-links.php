<?php

use App\Http\Controllers\Api\ActionLinkController;
use App\Services\Pont\LiensDAction;
use Illuminate\Support\Facades\Route;

/*
 * TCK-2982 (ADR-0132 § 5) — le lien d'action signé : un geste, sur un objet, une fois, 7 jours.
 *
 * Public, SANS `auth` : le jeton est l'autorisation, et la politique de l'objet est rejugée au moment du
 * geste pour le compte du lien. Bornées par IP ET par jeton (limiteur nommé `action-link`, empreinte du
 * jeton) ; le code de signature sous son propre compteur.
 */
Route::prefix('a/{token}')
    ->where(['token' => LiensDAction::MOTIF_DU_JETON])
    ->middleware('throttle:action-link')
    ->group(function (): void {
        Route::get('/', [ActionLinkController::class, 'show'])->name('action-links.show');
        Route::post('/', [ActionLinkController::class, 'act'])->name('action-links.act');
        Route::post('code', [ActionLinkController::class, 'sendCode'])
            ->middleware('throttle:5,10,action_link_code')
            ->name('action-links.code');
    });
