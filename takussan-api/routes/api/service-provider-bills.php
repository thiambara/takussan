<?php

use App\Http\Controllers\Api\ServiceProviderBillController;
use Illuminate\Support\Facades\Route;

// TCK-594 (ADR-0039 §8) — les factures d'intervention. `pay` est sous step-up 2FA (TCK-589,
// `ProtectedActions::STEP_UP`).
Route::middleware('auth:sanctum')->group(function () {
    Route::get('service-provider-bills', [ServiceProviderBillController::class, 'index'])->name('service-provider-bills.index');
    Route::get('service-provider-bills/{bill}', [ServiceProviderBillController::class, 'show'])
        ->whereNumber('bill')->name('service-provider-bills.show');
    Route::post('service-provider-bills/{serviceProviderBill}/validate', [ServiceProviderBillController::class, 'validateBill'])
        ->name('service-provider-bills.validate');
    Route::post('service-provider-bills/{serviceProviderBill}/reject', [ServiceProviderBillController::class, 'reject'])
        ->name('service-provider-bills.reject');
    Route::post('service-provider-bills/{serviceProviderBill}/pay', [ServiceProviderBillController::class, 'pay'])
        ->name('service-provider-bills.pay');
});
