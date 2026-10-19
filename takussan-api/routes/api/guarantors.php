<?php

use App\Http\Controllers\Api\GuarantorController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('guarantors', [GuarantorController::class, 'index'])->name('guarantors.index');
    Route::post('guarantors', [GuarantorController::class, 'store'])->name('guarantors.store');
    Route::get('guarantors/{guarantor}', [GuarantorController::class, 'show'])->name('guarantors.show');
    // TCK-955 (ADR-0070 § 5) — la pièce et le revenu en clair : admin de l'agence de l'auteur, sous
    // step-up, consultation journalisée.
    Route::get('guarantors/{guarantor}/sensitive', [GuarantorController::class, 'sensitive'])
        ->whereNumber('guarantor')
        ->name('guarantors.sensitive');
    Route::put('guarantors/{guarantor}', [GuarantorController::class, 'update'])->name('guarantors.update');
    Route::patch('guarantors/{guarantor}', [GuarantorController::class, 'update']);
    Route::delete('guarantors/{guarantor}', [GuarantorController::class, 'destroy'])->name('guarantors.destroy');
});
