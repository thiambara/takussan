<?php

use App\Http\Controllers\Api\Media\PrivateMediaController;
use App\Http\Controllers\Api\Media\SignMediaController;
use App\Http\Controllers\Api\MediaController;
use Illuminate\Support\Facades\Route;

// TCK-2115 (P215.01) — `{media}` se lie au modèle de Spatie, que `RefusesImpossibleRouteKeys` ne
// couvre pas : la contrainte de TCK-1851 rend 404 à un identifiant hors de `bigint` ou non numérique.
Route::middleware('auth:sanctum')->group(function () {
    Route::post('media', [MediaController::class, 'store'])
        ->middleware('throttle:30,1')
        ->name('media.store');
    Route::delete('media/{media}', [MediaController::class, 'destroy'])->where('media', '[0-9]{1,18}')->name('media.destroy');

    // TCK-105 — generate a short-lived signed CDN URL for a private media item.
    Route::get('media/{media}/sign', SignMediaController::class)
        ->where('media', '[0-9]{1,18}')
        ->middleware('throttle:60,1')
        ->name('media.sign');
});

// TCK-539 — un fichier privé, derrière une URL signée émise par une réponse déjà autorisée
// (`PrivateMediaAccess::signedUrl()`). Hors `auth:sanctum` : voir l'en-tête du contrôleur.
Route::get('media/{media}/file', PrivateMediaController::class)
    ->where('media', '[0-9]{1,18}')
    ->middleware(['signed:relative', 'throttle:60,1,media-file'])
    ->name('media.private.show');
