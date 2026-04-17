<?php

use App\Http\Controllers\Api\PropertyVisitController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('property-visits', [PropertyVisitController::class, 'index'])->name('property-visits.index');
    Route::post('property-visits', [PropertyVisitController::class, 'store'])->name('property-visits.store');
    Route::post('property-visits/{visit}/confirm', [PropertyVisitController::class, 'confirm'])->name('property-visits.confirm');
    Route::post('property-visits/{visit}/complete', [PropertyVisitController::class, 'complete'])->name('property-visits.complete');
    Route::post('property-visits/{visit}/cancel', [PropertyVisitController::class, 'cancel'])->name('property-visits.cancel');
});
