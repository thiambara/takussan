<?php

use App\Http\Controllers\Api\PaymentController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    // Unified payment router — creates BookingPayment or LeasePayment
    // depending on payable_type ('booking' | 'lease').
    Route::post('payments', [PaymentController::class, 'store'])->name('payments.store');

    // Consolidated history across BookingPayment + LeasePayment with
    // entity_type / entity_id / status / date filters.
    Route::get('payments/history', [PaymentController::class, 'history'])->name('payments.history');
});
