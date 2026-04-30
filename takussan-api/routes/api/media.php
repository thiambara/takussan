<?php

use App\Http\Controllers\Api\Media\SignMediaController;
use App\Http\Controllers\Api\MediaController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::post('media', [MediaController::class, 'store'])
        ->middleware('throttle:30,1')
        ->name('media.store');
    Route::post('media/upload', [MediaController::class, 'upload'])
        ->middleware('throttle:30,1')
        ->name('media.upload');
    Route::delete('media/{media}', [MediaController::class, 'destroy'])->name('media.destroy');

    // TCK-105 — generate a short-lived signed CDN URL for a private media item.
    Route::get('media/{media}/sign', SignMediaController::class)
        ->middleware('throttle:60,1')
        ->name('media.sign');
});
