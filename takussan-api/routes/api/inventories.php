<?php

use App\Http\Controllers\Api\InventoryController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('inventories', [InventoryController::class, 'index'])->name('inventories.index');
    Route::post('inventories', [InventoryController::class, 'store'])->name('inventories.store');
    Route::get('inventories/{inventory}', [InventoryController::class, 'show'])->name('inventories.show');
    Route::put('inventories/{inventory}', [InventoryController::class, 'update'])->name('inventories.update.put');
    Route::patch('inventories/{inventory}', [InventoryController::class, 'update'])->name('inventories.update');
    Route::post('inventories/{inventory}/submit', [InventoryController::class, 'submit'])->name('inventories.submit');
    Route::post('inventories/{inventory}/sign', [InventoryController::class, 'sign'])->name('inventories.sign');
    Route::post('inventories/{inventory}/dispute', [InventoryController::class, 'dispute'])->name('inventories.dispute');
    Route::post('inventories/{inventory}/room-photos', [InventoryController::class, 'uploadRoomPhotos'])->name('inventories.room-photos');
    // TCK-076 — PDF export, available once both parties have signed.
    Route::get('inventories/{inventory}/pdf', [InventoryController::class, 'downloadPdf'])->name('inventories.pdf');

    // List by property
    Route::get('properties/{property}/inventories', [InventoryController::class, 'indexForProperty'])->name('properties.inventories.index');
});
