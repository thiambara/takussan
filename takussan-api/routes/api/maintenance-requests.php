<?php

use App\Http\Controllers\Api\MaintenanceJournalController;
use App\Http\Controllers\Api\MaintenanceOwnerReminderController;
use App\Http\Controllers\Api\MaintenanceQuoteController;
use App\Http\Controllers\Api\MaintenanceRequestController;
use App\Http\Controllers\Api\SuggestedProvidersController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('maintenance-requests', [MaintenanceRequestController::class, 'index'])->name('maintenance-requests.index');
    // TCK-1404 (ADR-0072) — une intervention rejouée sous la même clé n'est ouverte qu'une fois.
    Route::post('maintenance-requests', [MaintenanceRequestController::class, 'store'])->middleware('idempotent')->name('maintenance-requests.store');
    // TCK-2652 — les comptes des files d'attente ; déclarée AVANT `{maintenanceRequest}`.
    Route::get('maintenance-requests/summary', [MaintenanceRequestController::class, 'summary'])->name('maintenance-requests.summary');
    Route::get('maintenance-requests/{maintenanceRequest}', [MaintenanceRequestController::class, 'show'])->name('maintenance-requests.show');
    // TCK-2652 — au plus trois prestataires du carnet, pour le dispatch.
    Route::get('maintenance-requests/{maintenanceRequest}/suggested-providers', SuggestedProvidersController::class)->name('maintenance-requests.suggested-providers');
    Route::put('maintenance-requests/{maintenanceRequest}', [MaintenanceRequestController::class, 'update'])->name('maintenance-requests.update');
    Route::patch('maintenance-requests/{maintenanceRequest}', [MaintenanceRequestController::class, 'update']);

    // Status transition (explicit state machine)
    Route::put('maintenance-requests/{maintenanceRequest}/status', [MaintenanceRequestController::class, 'updateStatus'])->name('maintenance-requests.status');

    // Completion workflow (sets completed + resolution notes + actual cost + photos)
    Route::put('maintenance-requests/{maintenanceRequest}/complete', [MaintenanceRequestController::class, 'complete'])->name('maintenance-requests.complete');

    // TCK-592 — le prestataire assigné accepte ou refuse
    Route::post('maintenance-requests/{maintenanceRequest}/accept', [MaintenanceRequestController::class, 'accept'])->name('maintenance-requests.accept');
    Route::post('maintenance-requests/{maintenanceRequest}/decline', [MaintenanceRequestController::class, 'decline'])->name('maintenance-requests.decline');

    // TCK-592 (P10) — clôture contradictoire : le demandeur confirme ou conteste.
    Route::post('maintenance-requests/{maintenanceRequest}/confirm-resolution', [MaintenanceRequestController::class, 'confirmResolution'])->name('maintenance-requests.confirm-resolution');
    Route::post('maintenance-requests/{maintenanceRequest}/contest-resolution', [MaintenanceRequestController::class, 'contestResolution'])->name('maintenance-requests.contest-resolution');

    // Media upload (photos / completion_photos)
    Route::post('maintenance-requests/{maintenanceRequest}/photos', [MaintenanceRequestController::class, 'uploadPhotos'])->name('maintenance-requests.photos');

    // Quote and Validation workflow
    Route::post('maintenance-requests/{maintenanceRequest}/quote/request', [MaintenanceQuoteController::class, 'requestQuote'])->name('maintenance-requests.quote.request');
    Route::post('maintenance-requests/{maintenanceRequest}/quote/submit', [MaintenanceQuoteController::class, 'submitQuote'])->name('maintenance-requests.quote.submit');
    Route::post('maintenance-requests/{maintenanceRequest}/quote/approve', [MaintenanceQuoteController::class, 'approveQuote'])->name('maintenance-requests.quote.approve');
    Route::post('maintenance-requests/{maintenanceRequest}/quote/reject', [MaintenanceQuoteController::class, 'rejectQuote'])->name('maintenance-requests.quote.reject');
    Route::get('maintenance-requests/{maintenanceRequest}/quote/pdf', [MaintenanceQuoteController::class, 'pdf'])->name('maintenance-requests.quote.pdf');
    Route::post('maintenance-requests/{maintenanceRequest}/start', [MaintenanceQuoteController::class, 'start'])->name('maintenance-requests.start');

    // TCK-2786 — « Relancer le bailleur » (une par 24 h, en `awaiting_owner`) et le journal de la demande.
    Route::post('maintenance-requests/{maintenanceRequest}/owner-reminders', [MaintenanceOwnerReminderController::class, 'store'])->name('maintenance-requests.owner-reminders.store');
    Route::get('maintenance-requests/{maintenanceRequest}/journal', [MaintenanceJournalController::class, 'index'])->name('maintenance-requests.journal');

    // History per property
    Route::get('properties/{property}/maintenance-requests', [MaintenanceRequestController::class, 'indexForProperty'])->name('properties.maintenance-requests.index');
});
