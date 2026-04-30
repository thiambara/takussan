<?php

use App\Http\Controllers\Api\MaintenanceQuoteController;
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

    // Quote and Validation workflow
    Route::post('maintenance-requests/{maintenanceRequest}/quote/request', [MaintenanceQuoteController::class, 'requestQuote'])->name('maintenance-requests.quote.request');
    Route::post('maintenance-requests/{maintenanceRequest}/quote/submit', [MaintenanceQuoteController::class, 'submitQuote'])->name('maintenance-requests.quote.submit');
    Route::post('maintenance-requests/{maintenanceRequest}/quote/approve', [MaintenanceQuoteController::class, 'approveQuote'])->name('maintenance-requests.quote.approve');
    Route::post('maintenance-requests/{maintenanceRequest}/quote/reject', [MaintenanceQuoteController::class, 'rejectQuote'])->name('maintenance-requests.quote.reject');
    Route::post('maintenance-requests/{maintenanceRequest}/start', [MaintenanceQuoteController::class, 'start'])->name('maintenance-requests.start');

    // History per property
    Route::get('properties/{property}/maintenance-requests', [MaintenanceRequestController::class, 'indexForProperty'])->name('properties.maintenance-requests.index');
});
