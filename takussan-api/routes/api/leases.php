<?php

use App\Http\Controllers\Api\LeaseController;
use App\Http\Controllers\Api\LeasePaymentController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('leases', [LeaseController::class, 'index'])->name('leases.index');
    Route::post('leases', [LeaseController::class, 'store'])->name('leases.store');
    Route::get('leases/{lease}', [LeaseController::class, 'show'])->name('leases.show');
    Route::post('leases/{lease}/activate', [LeaseController::class, 'activate'])->name('leases.activate');
    Route::post('leases/{lease}/terminate', [LeaseController::class, 'terminate'])->name('leases.terminate');
    Route::post('leases/{lease}/renew', [LeaseController::class, 'renew'])->name('leases.renew');
    Route::post('leases/{lease}/payments/generate-schedule', [LeaseController::class, 'generateSchedule'])->name('leases.payments.generate-schedule');
    Route::post('leases/{lease}/refund-deposit', [LeaseController::class, 'refundDeposit'])->name('leases.refund-deposit');

    // Nested payments
    Route::get('leases/{lease}/payments', [LeasePaymentController::class, 'index'])->name('leases.payments.index');
    Route::post('leases/{lease}/payments', [LeasePaymentController::class, 'store'])->name('leases.payments.store');
    Route::post('lease-payments/{payment}/mark-paid', [LeasePaymentController::class, 'markPaid'])
        ->name('lease-payments.mark-paid');
});
