<?php

use App\Http\Controllers\RoleController;
use Illuminate\Support\Facades\Route;

/**
 * ROLE ROUTES
 * ===========
 */
Route::prefix('roles')->controller(RoleController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{role}', 'show')->whereNumber('role')->name('show');
        Route::put('/{role}', 'update')->whereNumber('role')->name('update');
        Route::delete('/{role}', 'destroy')->whereNumber('role')->name('destroy');
        Route::post('/{role}/permissions', 'syncPermissions')->whereNumber('role')->name('sync-permissions');
    });
})->name('roles.');
