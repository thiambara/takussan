<?php

use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\InventoryTemplateController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('inventories', [InventoryController::class, 'index'])->name('inventories.index');
    // TCK-2646 — le modèle de pièces et d'éléments proposé pour un bien ou un type de bien.
    Route::get('inventory-templates', [InventoryTemplateController::class, 'index'])->name('inventory-templates.index');
    Route::post('inventories', [InventoryController::class, 'store'])->name('inventories.store');
    Route::get('inventories/{inventory}', [InventoryController::class, 'show'])->name('inventories.show');
    Route::put('inventories/{inventory}', [InventoryController::class, 'update'])->name('inventories.update.put');
    Route::patch('inventories/{inventory}', [InventoryController::class, 'update'])->name('inventories.update');
    Route::post('inventories/{inventory}/submit', [InventoryController::class, 'submit'])->name('inventories.submit');
    Route::post('inventories/{inventory}/sign', [InventoryController::class, 'sign'])
        // TCK-2646 — le limiteur de la saisie d'un code de signature, partagé avec le bail.
        ->middleware('throttle:lease-signature')
        ->name('inventories.sign');
    // TCK-2646 (ADR-0098) — le code du locataire qui signe sur l'appareil du personnel, SMS seulement.
    Route::post('inventories/{inventory}/sign/onsite-code', [InventoryController::class, 'sendOnsiteCode'])
        ->middleware('throttle:lease-signature-code')
        ->name('inventories.sign.onsite-code');
    Route::post('inventories/{inventory}/dispute', [InventoryController::class, 'dispute'])->name('inventories.dispute');
    Route::post('inventories/{inventory}/room-photos', [InventoryController::class, 'uploadRoomPhotos'])->name('inventories.room-photos');
    // TCK-596 — retrait d'une photo de pièce, en brouillon seulement.
    Route::delete('inventories/{inventory}/room-photos/{media}', [InventoryController::class, 'destroyRoomPhoto'])
        ->where('media', '[0-9]{1,18}')
        ->name('inventories.room-photos.destroy');
    // TCK-076 — PDF export, available once both parties have signed.
    Route::get('inventories/{inventory}/pdf', [InventoryController::class, 'downloadPdf'])->name('inventories.pdf');

    // List by property
    Route::get('properties/{property}/inventories', [InventoryController::class, 'indexForProperty'])->name('properties.inventories.index');
});
