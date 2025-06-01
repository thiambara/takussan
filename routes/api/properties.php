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
        // Media
        Route::get('/{property}/media', 'getMedia')->whereNumber('property')->name('get-media');
        Route::post('/{property}/media', 'storeMedia')->whereNumber('property')->name('store-media');
        Route::delete('/{property}/media/{media}', 'destroyMedia')->whereNumber('property')->whereNumber('media')->name('destroy-media');
        Route::put('/{property}/media/{media}', 'setFeatured')->whereNumber('property')->whereNumber('media')->name('set-featured');
    });
})->name('proprieties.');
