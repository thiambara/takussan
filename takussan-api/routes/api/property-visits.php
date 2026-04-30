<?php

use App\Http\Controllers\Api\PropertyVisitController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('property-visits', [PropertyVisitController::class, 'index'])->name('property-visits.index');
    Route::get('property-visits/{visit}', [PropertyVisitController::class, 'show'])->name('property-visits.show');
    Route::post('property-visits', [PropertyVisitController::class, 'store'])->name('property-visits.store');
    Route::put('property-visits/{visit}', [PropertyVisitController::class, 'update'])->name('property-visits.update');
    Route::patch('property-visits/{visit}', [PropertyVisitController::class, 'update']);
    Route::post('property-visits/{visit}/confirm', [PropertyVisitController::class, 'confirm'])->name('property-visits.confirm');
    Route::post('property-visits/{visit}/complete', [PropertyVisitController::class, 'complete'])->name('property-visits.complete');
    Route::post('property-visits/{visit}/cancel', [PropertyVisitController::class, 'cancel'])->name('property-visits.cancel');
    Route::post('property-visits/{visit}/feedback', [PropertyVisitController::class, 'feedback'])->name('property-visits.feedback');
    Route::delete('property-visits/{visit}', [PropertyVisitController::class, 'destroy'])->name('property-visits.destroy');
});
