<?php

use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

/**
 * USER ROUTES
 * ===========
 */
Route::prefix('users')->controller(UserController::class)->group(function () {
    Route::post('/', 'store')->name('store');
    Route::post('/forgot-password', 'forgotPassword')->name('forgot-password');
    Route::post('/reset-password', 'resetPassword')->name('reset-password');

    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::get('/{user}', 'show')->whereNumber('user')->name('show');
        Route::put('/{user}', 'update')->whereNumber('user')->name('update');
        Route::delete('/{user}', 'destroy')->whereNumber('user')->name('destroy');
    });
})->name('users.');
