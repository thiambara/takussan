<?php

use App\Http\Controllers\PropertyController;
use Illuminate\Support\Facades\Route;

/**
 * PROPERTY ROUTES
 * ==============
 */
Route::prefix('properties')->controller(PropertyController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{property}', 'show')->whereNumber('property')->name('show');
        Route::put('/{property}', 'update')->whereNumber('property')->name('update');
        Route::delete('/{property}', 'destroy')->whereNumber('property')->name('destroy');
    });
})->name('proprieties.');
