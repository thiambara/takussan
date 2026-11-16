<?php

use App\Http\Controllers\Api\ServiceProviderBillController;
use App\Http\Controllers\Api\ServiceProviderBillPdfController;
use App\Http\Controllers\Api\ServiceProviderBillStatementController;
use Illuminate\Support\Facades\Route;

// TCK-594 (ADR-0039 §8) — les factures d'intervention. `pay` est sous step-up 2FA (TCK-589,
// `ProtectedActions::STEP_UP`).
Route::middleware('auth:sanctum')->group(function () {
    Route::get('service-provider-bills', [ServiceProviderBillController::class, 'index'])->name('service-provider-bills.index');
    // TCK-2911 (ADR-0120 § 2) — le relevé des factures du prestataire appelant ; déclaré AVANT `{bill}`.
    Route::get('service-provider-bills/statement/pdf', ServiceProviderBillStatementController::class)
        ->name('service-provider-bills.statement.pdf');
    Route::get('service-provider-bills/{bill}', [ServiceProviderBillController::class, 'show'])
        ->where('bill', '[0-9]{1,18}')->name('service-provider-bills.show');
    // TCK-2897 (ADR-0099, amendement du 2026-11-15) — le PDF d'une facture, servi par le coffre.
    Route::get('service-provider-bills/{bill}/pdf', ServiceProviderBillPdfController::class)
        ->where('bill', '[0-9]{1,18}')->name('service-provider-bills.pdf');
    Route::post('service-provider-bills/{serviceProviderBill}/validate', [ServiceProviderBillController::class, 'validateBill'])
        ->name('service-provider-bills.validate');
    Route::post('service-provider-bills/{serviceProviderBill}/reject', [ServiceProviderBillController::class, 'reject'])
        ->name('service-provider-bills.reject');
    Route::post('service-provider-bills/{serviceProviderBill}/pay', [ServiceProviderBillController::class, 'pay'])
        ->name('service-provider-bills.pay');
    // TCK-2911 (ADR-0120 § 1) — « Facturer » : le prestataire envoie son brouillon.
    Route::post('service-provider-bills/{serviceProviderBill}/submit', [ServiceProviderBillController::class, 'submit'])
        ->name('service-provider-bills.submit');
});
