<?php

use App\Http\Controllers\Api\AgencyController;
use App\Http\Controllers\Api\ReviewController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('agencies', [AgencyController::class, 'index'])->name('agencies.index');
    Route::post('agencies', [AgencyController::class, 'store'])->name('agencies.store');
    Route::get('agencies/{agency}', [AgencyController::class, 'show'])->name('agencies.show');
    Route::put('agencies/{agency}', [AgencyController::class, 'update'])->name('agencies.update');
    Route::patch('agencies/{agency}', [AgencyController::class, 'update']);
    Route::delete('agencies/{agency}', [AgencyController::class, 'destroy'])->name('agencies.destroy');

    // Agency reviews
    Route::get('agencies/{agency}/reviews', [ReviewController::class, 'indexForAgency'])->name('agencies.reviews.index');
    Route::post('agencies/{agency}/reviews', [ReviewController::class, 'storeForAgency'])->name('agencies.reviews.store');
});
