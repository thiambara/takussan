<?php

use App\Http\Controllers\Api\Me\MeProfilesController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Me Routes (TCK-141 — Active profile context)
|--------------------------------------------------------------------------
*/

Route::middleware('auth:sanctum')->prefix('me')->group(function () {
    Route::get('profiles', [MeProfilesController::class, 'index'])->name('me.profiles.index');
    Route::patch('active-profile', [MeProfilesController::class, 'updateActive'])->name('me.active-profile.update');
});
