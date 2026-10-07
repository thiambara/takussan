<?php

use App\Http\Controllers\Api\PayoutController;
use App\Http\Controllers\Api\PayoutPreparationController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('payouts', [PayoutController::class, 'index'])->name('payouts.index');
    Route::post('payouts', [PayoutController::class, 'store'])->name('payouts.store');
    // TCK-594 — littérale, donc AVANT `payouts/{payout}`.
    Route::get('payouts/preparation', [PayoutPreparationController::class, 'show'])->name('payouts.preparation');
    Route::get('payouts/{payout}', [PayoutController::class, 'show'])->name('payouts.show');
    // TCK-594 (ADR-0039 §4) — point de raccord TCK-589 : le step-up 2FA s'ajoute sur `approve` et
    // `mark-processed` par `->middleware(...)`, une ligne chacune.
    Route::post('payouts/{payout}/approve', [PayoutController::class, 'approve'])->name('payouts.approve');
    Route::post('payouts/{payout}/mark-processed', [PayoutController::class, 'markProcessed'])
        ->name('payouts.mark-processed');
    Route::post('payouts/{payout}/mark-failed', [PayoutController::class, 'markFailed'])
        ->name('payouts.mark-failed');
    Route::post('payouts/{payout}/cancel', [PayoutController::class, 'cancel'])->name('payouts.cancel');
});
