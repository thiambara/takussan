<?php

use App\Http\Controllers\Api\SavedSearchController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('saved-searches', [SavedSearchController::class, 'index'])->name('saved-searches.index');
    Route::post('saved-searches', [SavedSearchController::class, 'store'])->name('saved-searches.store');
    Route::put('saved-searches/{savedSearch}', [SavedSearchController::class, 'update'])->name('saved-searches.update');
    Route::patch('saved-searches/{savedSearch}', [SavedSearchController::class, 'update']);
    Route::delete('saved-searches/{savedSearch}', [SavedSearchController::class, 'destroy'])->name('saved-searches.destroy');
});
