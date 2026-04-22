<?php

use App\Http\Controllers\Api\MaintenanceRequestController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('maintenance-requests', [MaintenanceRequestController::class, 'index'])->name('maintenance-requests.index');
    Route::post('maintenance-requests', [MaintenanceRequestController::class, 'store'])->name('maintenance-requests.store');
    Route::get('maintenance-requests/{maintenanceRequest}', [MaintenanceRequestController::class, 'show'])->name('maintenance-requests.show');
    Route::put('maintenance-requests/{maintenanceRequest}', [MaintenanceRequestController::class, 'update'])->name('maintenance-requests.update');
    Route::patch('maintenance-requests/{maintenanceRequest}', [MaintenanceRequestController::class, 'update']);

    // Status transition (explicit state machine)
    Route::put('maintenance-requests/{maintenanceRequest}/status', [MaintenanceRequestController::class, 'updateStatus'])->name('maintenance-requests.status');

    // Completion workflow (sets completed + resolution notes + actual cost + photos)
    Route::put('maintenance-requests/{maintenanceRequest}/complete', [MaintenanceRequestController::class, 'complete'])->name('maintenance-requests.complete');

    // Media upload (photos / completion_photos)
    Route::post('maintenance-requests/{maintenanceRequest}/photos', [MaintenanceRequestController::class, 'uploadPhotos'])->name('maintenance-requests.photos');

    // History per property
    Route::get('properties/{property}/maintenance-requests', [MaintenanceRequestController::class, 'indexForProperty'])->name('properties.maintenance-requests.index');
});
