<?php

use App\Http\Controllers\ReviewController;
use Illuminate\Support\Facades\Route;

/**
 * REVIEW ROUTES
 * =============
 */
Route::prefix('reviews')->controller(ReviewController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{review}', 'show')->whereNumber('review')->name('show');
        Route::put('/{review}', 'update')->whereNumber('review')->name('update');
        Route::delete('/{review}', 'destroy')->whereNumber('review')->name('destroy');
        Route::post('/{review}/approve', 'approve')->whereNumber('review')->name('approve');
        Route::post('/{review}/reject', 'reject')->whereNumber('review')->name('reject');
        Route::post('/{review}/report', 'report')->whereNumber('review')->name('report');
        Route::get('/for-model', 'getForModel')->name('for-model');
    });
})->name('reviews.');
