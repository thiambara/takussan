<?php

use App\Http\Controllers\Api\CommissionEntryController;
use Illuminate\Support\Facades\Route;

// TCK-595 (ADR-0049 §3) — le grand livre des commissions d'agence. `mark-paid` et `cancel` sont des
// gestes d'argent : famille protégée (`ProtectedActions`), et `mark-paid` sous step-up 2FA, comme
// `payouts/{payout}/mark-processed`.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('commissions', [CommissionEntryController::class, 'index'])->name('commissions.index');
    Route::post('commissions/{commissionEntry}/mark-paid', [CommissionEntryController::class, 'markPaid'])->name('commissions.mark-paid');
    Route::post('commissions/{commissionEntry}/cancel', [CommissionEntryController::class, 'cancel'])->name('commissions.cancel');
});
