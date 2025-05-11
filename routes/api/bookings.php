<?php

use App\Http\Controllers\BookingController;
use Illuminate\Support\Facades\Route;

/**
 * BOOKING ROUTES
 * ==============
 */
Route::prefix('bookings')->controller(BookingController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{booking}', 'show')->whereNumber('booking')->name('show');
        Route::put('/{booking}', 'update')->whereNumber('booking')->name('update');
        Route::delete('/{booking}', 'destroy')->whereNumber('booking')->name('destroy');
    });
})->name('bookings.');
