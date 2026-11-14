<?php

use App\Http\Controllers\Api\Admin\PlatformSettingController;
use App\Http\Controllers\Api\LeaseSettingsController;
use App\Http\Controllers\Api\SettingController;
use Illuminate\Support\Facades\Route;

Route::get('settings/public', [PlatformSettingController::class, 'publicIndex'])->name('settings.public');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('settings', [SettingController::class, 'index'])->name('settings.index');
    // TCK-2832 — littérale, avant les routes paramétrées.
    Route::get('settings/lease', LeaseSettingsController::class)->name('settings.lease');
    Route::post('settings', [SettingController::class, 'store'])->name('settings.store');
    Route::put('settings/{setting}', [SettingController::class, 'update'])->name('settings.update');
    Route::patch('settings/{setting}', [SettingController::class, 'update']);
    Route::delete('settings/{setting}', [SettingController::class, 'destroy'])->name('settings.destroy');
});
