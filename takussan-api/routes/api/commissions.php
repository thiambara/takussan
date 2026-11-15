<?php

use App\Http\Controllers\Api\CommissionEntryController;
use Illuminate\Support\Facades\Route;

// TCK-595 (ADR-0049 §3) — le grand livre des commissions d'agence. `mark-paid` et `cancel` sont des
// gestes d'argent : famille protégée (`ProtectedActions`), et `mark-paid` sous step-up 2FA, comme
// `payouts/{payout}/mark-processed`.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('commissions', [CommissionEntryController::class, 'index'])->name('commissions.index');
    // TCK-2661 — le point par bénéficiaire, et le solde groupé de ses lignes (littérales avant
    // `{commissionEntry}`).
    Route::get('commissions/summary', [CommissionEntryController::class, 'summary'])->name('commissions.summary');
    Route::post('commissions/settle', [CommissionEntryController::class, 'settle'])->name('commissions.settle');
    Route::post('commissions/{commissionEntry}/mark-paid', [CommissionEntryController::class, 'markPaid'])->name('commissions.mark-paid');
    Route::post('commissions/{commissionEntry}/cancel', [CommissionEntryController::class, 'cancel'])->name('commissions.cancel');
});
