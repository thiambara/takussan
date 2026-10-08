<?php

use App\Http\Controllers\Api\PropertyVisitController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('property-visits', [PropertyVisitController::class, 'index'])->name('property-visits.index');
    Route::get('property-visits/{visit}', [PropertyVisitController::class, 'show'])->name('property-visits.show');
    // TCK-590 — la planification confirmée fait partir un SMS : bornée par émetteur et par
    // destinataire (`visit-planning`, vérification adverse B2).
    Route::post('property-visits', [PropertyVisitController::class, 'store'])
        ->middleware('throttle:visit-planning')
        ->name('property-visits.store');
    Route::put('property-visits/{visit}', [PropertyVisitController::class, 'update'])->name('property-visits.update');
    Route::patch('property-visits/{visit}', [PropertyVisitController::class, 'update']);
    Route::post('property-visits/{visit}/confirm', [PropertyVisitController::class, 'confirm'])->name('property-visits.confirm');
    Route::post('property-visits/{visit}/complete', [PropertyVisitController::class, 'complete'])->name('property-visits.complete');
    Route::post('property-visits/{visit}/cancel', [PropertyVisitController::class, 'cancel'])->name('property-visits.cancel');
    // TCK-590 — prise en charge par le personnel, et nouveau créneau proposé par le visiteur.
    Route::post('property-visits/{visit}/claim', [PropertyVisitController::class, 'claim'])->name('property-visits.claim');
    Route::post('property-visits/{visit}/reschedule', [PropertyVisitController::class, 'reschedule'])->name('property-visits.reschedule');
    Route::post('property-visits/{visit}/feedback', [PropertyVisitController::class, 'feedback'])->name('property-visits.feedback');
    Route::delete('property-visits/{visit}', [PropertyVisitController::class, 'destroy'])->name('property-visits.destroy');
});
