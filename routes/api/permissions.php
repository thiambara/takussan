<?php

use App\Http\Controllers\PermissionController;
use Illuminate\Support\Facades\Route;

/**
 * PERMISSION ROUTES
 * ===========
 */
Route::prefix('permissions')->controller(PermissionController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{permission}', 'show')->whereNumber('permission')->name('show');
        Route::put('/{permission}', 'update')->whereNumber('permission')->name('update');
        Route::delete('/{permission}', 'destroy')->whereNumber('permission')->name('destroy');
    });
})->name('permissions.');
