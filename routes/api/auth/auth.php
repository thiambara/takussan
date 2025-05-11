<?php

use App\Http\Controllers\Auth\AuthController;
use Illuminate\Support\Facades\Route;

/**
 * AUTH ROUTES
 * ==============
 */
Route::prefix('auth')->controller(AuthController::class)->group(function () {
    Route::post('/login', 'login')->name('auth-user');
    Route::post('/sign-up', 'signUp')->name('sign-up');
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/auth-user', 'authUser')->name('auth-user');
        Route::post('/logout', 'logout')->name('logout');
    });
})->name('auth.');
