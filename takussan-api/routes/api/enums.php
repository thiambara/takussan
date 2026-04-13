<?php

use App\Http\Controllers\EnumsController;
use Illuminate\Support\Facades\Route;

/**
 * TAG ROUTES
 * ===========
 */
Route::prefix('enums')->controller(EnumsController::class)->group(function () {
    Route::get('/', 'index')->name('index');
})->name('enums.');
