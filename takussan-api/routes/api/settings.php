<?php

use App\Http\Controllers\Api\Admin\PlatformSettingController;
use App\Http\Controllers\Api\SettingController;
use Illuminate\Support\Facades\Route;

Route::get('settings/public', [PlatformSettingController::class, 'publicIndex'])->name('settings.public');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('settings', [SettingController::class, 'index'])->name('settings.index');
    Route::post('settings', [SettingController::class, 'store'])->name('settings.store');
    Route::put('settings/{setting}', [SettingController::class, 'update'])->name('settings.update');
    Route::patch('settings/{setting}', [SettingController::class, 'update']);
    Route::delete('settings/{setting}', [SettingController::class, 'destroy'])->name('settings.destroy');
});
