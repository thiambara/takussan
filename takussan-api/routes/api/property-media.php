<?php

use App\Http\Controllers\PropertyMediaController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    // Property media routes
    Route::get('/properties/{propertyId}/media', [PropertyMediaController::class, 'index']);
    Route::post('/properties/{propertyId}/media', [PropertyMediaController::class, 'store']);
    Route::delete('/properties/{propertyId}/media/{mediaId}', [PropertyMediaController::class, 'destroy']);
    Route::post('/properties/{propertyId}/media/{mediaId}/featured', [PropertyMediaController::class, 'setFeatured']);
});
