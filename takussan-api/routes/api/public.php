<?php

use App\Http\Controllers\Public\PublicPropertyController;
use Illuminate\Support\Facades\Route;

Route::prefix('public')->name('public.')->group(function () {
    Route::get('properties', [PublicPropertyController::class, 'index'])
        ->name('properties.index');

    Route::get('properties/search', [PublicPropertyController::class, 'search'])
        ->name('properties.search');

    Route::get('properties/{slug}', [PublicPropertyController::class, 'show'])
        ->name('properties.show');

    Route::get('properties/{slug}/contact', [PublicPropertyController::class, 'contact'])
        ->name('properties.contact');

    Route::get('properties/{slug}/similar', [PublicPropertyController::class, 'similar'])
        ->name('properties.similar');

    Route::get('properties/{slug}/reviews', [PublicPropertyController::class, 'reviews'])
        ->name('properties.reviews');

    Route::post('properties/{slug}/report', [PublicPropertyController::class, 'report'])
        ->middleware('throttle:5,60')
        ->name('properties.report');

    Route::post('properties/{slug}/visit-request', [PublicPropertyController::class, 'visitRequest'])
        ->middleware('throttle:10,60')
        ->name('properties.visit-request');
});
