<?php

use App\Http\Controllers\Api\Me\DataExportController;
use App\Http\Controllers\Api\Me\MeProfilesController;
use App\Http\Controllers\Api\Me\SubscriptionController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Me Routes (TCK-141 — Active profile context)
|--------------------------------------------------------------------------
*/

Route::middleware('auth:sanctum')->prefix('me')->group(function () {
    Route::get('profiles', [MeProfilesController::class, 'index'])->name('me.profiles.index');
    Route::patch('active-profile', [MeProfilesController::class, 'updateActive'])->name('me.active-profile.update');
    Route::get('data-exports', [DataExportController::class, 'index'])->name('me.data-exports.index');
    Route::post('data-exports', [DataExportController::class, 'store'])->name('me.data-exports.store');
    Route::get('subscription', [SubscriptionController::class, 'show'])->name('me.subscription.show');
});
