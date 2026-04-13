<?php

use App\Http\Controllers\CustomerController;
use Illuminate\Support\Facades\Route;

/**
 * CUSTOMER ROUTES
 * ===========
 */
Route::prefix('customers')->controller(CustomerController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{customer}', 'show')->whereNumber('customer')->name('show');
        Route::put('/{customer}', 'update')->whereNumber('customer')->name('update');
        Route::delete('/{customer}', 'destroy')->whereNumber('customer')->name('destroy');
    });
})->name('customers.');
