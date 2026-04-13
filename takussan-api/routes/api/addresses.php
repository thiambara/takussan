<?php

use App\Http\Controllers\AddressController;
use Illuminate\Support\Facades\Route;

/**
 * ADDRESS ROUTES
 * ==============
 */
Route::prefix('addresses')->controller(AddressController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{address}', 'show')->whereNumber('address')->name('show');
        Route::put('/{address}', 'update')->whereNumber('address')->name('update');
        Route::delete('/{address}', 'destroy')->whereNumber('address')->name('destroy');
    });
})->name('addresses.');
