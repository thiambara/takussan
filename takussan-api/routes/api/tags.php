<?php

use App\Http\Controllers\TagController;
use Illuminate\Support\Facades\Route;

/**
 * TAG ROUTES
 * ===========
 */
Route::prefix('tags')->controller(TagController::class)->group(function () {
    /**
     * PRIVATE ROUTES
     */
    Route::middleware("auth:sanctum")->group(function () {
        Route::get('/', 'index')->name('index');
        Route::post('/', 'store')->name('store');
        Route::get('/{tag}', 'show')->whereNumber('tag')->name('show');
        Route::put('/{tag}', 'update')->whereNumber('tag')->name('update');
        Route::delete('/{tag}', 'destroy')->whereNumber('tag')->name('destroy');
        Route::get('/by-type', 'getByType')->name('by-type');
    });
})->name('tags.');
