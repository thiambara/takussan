<?php

use App\Http\Controllers\Api\InventoryController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('inventories', [InventoryController::class, 'index'])->name('inventories.index');
    Route::post('inventories', [InventoryController::class, 'store'])->name('inventories.store');
    Route::get('inventories/{inventory}', [InventoryController::class, 'show'])->name('inventories.show');
    Route::patch('inventories/{inventory}', [InventoryController::class, 'update'])->name('inventories.update');
    Route::post('inventories/{inventory}/submit', [InventoryController::class, 'submit'])->name('inventories.submit');
    Route::post('inventories/{inventory}/sign', [InventoryController::class, 'sign'])->name('inventories.sign');
    Route::post('inventories/{inventory}/dispute', [InventoryController::class, 'dispute'])->name('inventories.dispute');
});
