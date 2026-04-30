<?php

use App\Http\Controllers\Api\IntegrationController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('integrations', [IntegrationController::class, 'index'])->name('integrations.index');
    Route::post('integrations', [IntegrationController::class, 'store'])->name('integrations.store');
    Route::put('integrations/{integration}', [IntegrationController::class, 'update'])->name('integrations.update');
    Route::patch('integrations/{integration}', [IntegrationController::class, 'update']);
    Route::post('integrations/{integration}/test', [IntegrationController::class, 'test'])->name('integrations.test');
    Route::delete('integrations/{integration}', [IntegrationController::class, 'destroy'])->name('integrations.destroy');
});
