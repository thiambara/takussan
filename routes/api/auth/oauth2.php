<?php

use App\Http\Controllers\Auth\OAuth2Controller;
use Illuminate\Support\Facades\Route;

/**
 * OAUTH2 ROUTES
 * =============
 */
Route::prefix('oauth2')->controller(OAuth2Controller::class)->group(function () {
    Route::any('google-redirect', 'googleRedirect')->name('google-redirect');
    Route::any('google-callback', 'googleCallback')->name('google-callback');
})->name('oauth2.');
