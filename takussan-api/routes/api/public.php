<?php

use App\Http\Controllers\Public\PublicPropertyController;
use Illuminate\Support\Facades\Route;

Route::prefix('public')->name('public.')->group(function () {
    Route::get('properties', [PublicPropertyController::class, 'index'])
        ->name('properties.index');

    // Route search ajoutée ici (MVP-006) — doit précéder {slug} pour éviter le conflit

    Route::get('properties/{slug}', [PublicPropertyController::class, 'show'])
        ->name('properties.show');

    Route::get('properties/{slug}/contact', [PublicPropertyController::class, 'contact'])
        ->name('properties.contact');
});
