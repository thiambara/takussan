<?php

use App\Http\Controllers\Api\IntegrationController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('integrations', [IntegrationController::class, 'index'])->name('integrations.index');
    Route::post('integrations', [IntegrationController::class, 'store'])->name('integrations.store');
    Route::put('integrations/{integration}', [IntegrationController::class, 'update'])->name('integrations.update');
    Route::patch('integrations/{integration}', [IntegrationController::class, 'update']);
    Route::post('integrations/{integration}/test', [IntegrationController::class, 'test'])->name('integrations.test');
    // TCK-293 (ADR-0046 §7) — l'URL de webhook d'une intégration de paiement, et sa régénération.
    Route::get('integrations/{integration}/webhook-endpoint', [IntegrationController::class, 'webhookEndpoint'])->name('integrations.webhook-endpoint.show');
    Route::post('integrations/{integration}/webhook-endpoint', [IntegrationController::class, 'rotateWebhookEndpoint'])->name('integrations.webhook-endpoint.rotate');
    Route::delete('integrations/{integration}', [IntegrationController::class, 'destroy'])->name('integrations.destroy');
});
