<?php

use App\Http\Controllers\Api\DocumentPdfController;
use App\Http\Controllers\Api\LeaseChainController;
use App\Http\Controllers\Api\LeaseController;
use App\Http\Controllers\Api\LeaseDepositRefundController;
use App\Http\Controllers\Api\LeasePaymentController;
use App\Http\Controllers\Api\LeaseRenewalController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('leases', [LeaseController::class, 'index'])->name('leases.index');
    Route::post('leases', [LeaseController::class, 'store'])->name('leases.store');
    Route::get('leases/{lease}', [LeaseController::class, 'show'])->name('leases.show');
    Route::patch('leases/{lease}', [LeaseController::class, 'update'])->name('leases.update');
    Route::post('leases/{lease}/activate', [LeaseController::class, 'activate'])->name('leases.activate');
    Route::post('leases/{lease}/terminate', [LeaseController::class, 'terminate'])->name('leases.terminate');
    // TCK-089 — replaces the legacy `LeaseController@renew` (TCK-027) which
    // did not enforce no-active-child / max-chain / tenant-immutable / event.
    Route::post('leases/{lease}/renew', [LeaseRenewalController::class, 'store'])->name('leases.renew');
    Route::get('leases/{lease}/chain', [LeaseChainController::class, 'index'])->name('leases.chain');
    Route::post('leases/{lease}/payments/generate-schedule', [LeaseController::class, 'generateSchedule'])->name('leases.payments.generate-schedule');

    // TCK-088 — caution refund. Replaces the legacy `/refund-deposit`
    // endpoint (TCK-027) which only handled a single full refund without
    // amount/reason/attachments/payout/invoice.
    Route::post('leases/{lease}/deposit-refund', [LeaseDepositRefundController::class, 'store'])->name('leases.deposit-refund.store');
    Route::get('leases/{lease}/deposit-refund', [LeaseDepositRefundController::class, 'show'])->name('leases.deposit-refund.show');

    // Nested payments
    Route::get('leases/{lease}/payments', [LeasePaymentController::class, 'index'])->name('leases.payments.index');
    Route::post('leases/{lease}/payments', [LeasePaymentController::class, 'store'])->name('leases.payments.store');
    Route::post('lease-payments/{payment}/mark-paid', [LeasePaymentController::class, 'markPaid'])
        ->name('lease-payments.mark-paid');

    // Nested guarantors (many-to-many, max 3 per lease)
    Route::get('leases/{lease}/guarantors', [LeaseController::class, 'listGuarantors'])->name('leases.guarantors.index');
    Route::post('leases/{lease}/guarantors', [LeaseController::class, 'attachGuarantor'])->name('leases.guarantors.store');
    Route::delete('leases/{lease}/guarantors/{guarantor}', [LeaseController::class, 'detachGuarantor'])->name('leases.guarantors.destroy');

    // TCK-077 — PDF receipts & contract
    Route::get('leases/{lease}/receipts/{payment}/pdf', [DocumentPdfController::class, 'receipt'])
        ->name('leases.receipts.pdf');
    Route::get('leases/{lease}/contract/pdf', [DocumentPdfController::class, 'leaseContract'])
        ->name('leases.contract.pdf');
});
