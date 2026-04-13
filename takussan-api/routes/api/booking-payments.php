<?php

use App\Http\Controllers\BookingPaymentController;
use Illuminate\Support\Facades\Route;

/**
 * BOOKING PAYMENT ROUTES
 * ======================
 */
Route::prefix('booking-payments')->controller(BookingPaymentController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{bookingPayment}', 'show')->whereNumber('bookingPayment')->name('show');
        Route::put('/{bookingPayment}', 'update')->whereNumber('bookingPayment')->name('update');
        Route::delete('/{bookingPayment}', 'destroy')->whereNumber('bookingPayment')->name('destroy');
        Route::get('/booking/{booking}', 'getBookingPayments')->whereNumber('booking')->name('booking-payments');
    });
})->name('booking-payments.');
