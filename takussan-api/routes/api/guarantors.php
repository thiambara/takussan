<?php

use App\Http\Controllers\Api\GuarantorController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('guarantors', [GuarantorController::class, 'index'])->name('guarantors.index');
    Route::post('guarantors', [GuarantorController::class, 'store'])->name('guarantors.store');
    Route::get('guarantors/{guarantor}', [GuarantorController::class, 'show'])->name('guarantors.show');
    Route::put('guarantors/{guarantor}', [GuarantorController::class, 'update'])->name('guarantors.update');
    Route::patch('guarantors/{guarantor}', [GuarantorController::class, 'update']);
    Route::delete('guarantors/{guarantor}', [GuarantorController::class, 'destroy'])->name('guarantors.destroy');
});
