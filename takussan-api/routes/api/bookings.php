<?php

use App\Http\Controllers\Api\Admin\BookingController as AdminBookingController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\BookingPaymentController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('bookings', [BookingController::class, 'index'])->name('bookings.index');
    Route::post('bookings', [BookingController::class, 'store'])->name('bookings.store');
    Route::get('bookings/{booking}', [BookingController::class, 'show'])->name('bookings.show');
    Route::post('bookings/{booking}/confirm', [BookingController::class, 'confirm'])->name('bookings.confirm');
    Route::post('bookings/{booking}/cancel', [BookingController::class, 'cancel'])->name('bookings.cancel');
    Route::post('bookings/{booking}/reject', [BookingController::class, 'reject'])->name('bookings.reject');

    // TCK-101 — admin force-expire (agency_admin / super_admin). Moved out of
    // /api/admin/* (now super-admin only since TCK-144) — controller still
    // owns the role check.
    Route::post('bookings/{booking}/expire-now', [AdminBookingController::class, 'expireNow'])
        ->name('bookings.expire-now');

    // Nested payments
    Route::get('bookings/{booking}/payments', [BookingPaymentController::class, 'index'])
        ->name('bookings.payments.index');
    Route::post('bookings/{booking}/payments', [BookingPaymentController::class, 'store'])
        ->name('bookings.payments.store');
    Route::post('booking-payments/{payment}/refund', [BookingPaymentController::class, 'refund'])
        ->name('booking-payments.refund');

    // TCK-172 — quittance PDF d'un BookingPayment acquitté.
    Route::get('booking-payments/{payment}/receipt', [BookingPaymentController::class, 'receipt'])
        ->name('booking-payments.receipt');
});
