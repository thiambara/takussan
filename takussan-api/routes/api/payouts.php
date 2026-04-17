<?php

use App\Http\Controllers\Api\PayoutController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('payouts', [PayoutController::class, 'index'])->name('payouts.index');
    Route::post('payouts', [PayoutController::class, 'store'])->name('payouts.store');
    Route::get('payouts/{payout}', [PayoutController::class, 'show'])->name('payouts.show');
    Route::post('payouts/{payout}/mark-processed', [PayoutController::class, 'markProcessed'])
        ->name('payouts.mark-processed');
    Route::post('payouts/{payout}/mark-failed', [PayoutController::class, 'markFailed'])
        ->name('payouts.mark-failed');
    Route::post('payouts/{payout}/cancel', [PayoutController::class, 'cancel'])->name('payouts.cancel');
});
