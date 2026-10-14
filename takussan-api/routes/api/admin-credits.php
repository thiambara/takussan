<?php

use App\Http\Controllers\Api\Admin\AdminBoostController;
use App\Http\Controllers\Api\Admin\AdminBoostProductController;
use App\Http\Controllers\Api\Admin\AdminBoostStatsController;
use App\Http\Controllers\Api\Admin\AdminCreditWalletController;
use Illuminate\Support\Facades\Route;

/*
| TCK-633 lot F (ADR-0061) — la console des crédits et de la mise en avant. Aucun geste
| (`platform-can:`) déclaré : ces routes restent au seul `super_admin` (`PlatformRoutesDefaultDenyTest`).
| Les écritures sont sous second facteur récent (`ProtectedActions::STEP_UP`).
*/
Route::middleware(['auth:sanctum', 'super-admin'])->prefix('admin')->group(function () {
    Route::get('boost-products', [AdminBoostProductController::class, 'index'])->name('admin.boost-products.index');
    Route::post('boost-products', [AdminBoostProductController::class, 'store'])->name('admin.boost-products.store');
    Route::patch('boost-products/{boostProduct}', [AdminBoostProductController::class, 'update'])->name('admin.boost-products.update');

    Route::get('credit-wallets', [AdminCreditWalletController::class, 'index'])->name('admin.credit-wallets.index');
    Route::get('credit-wallets/{agency}', [AdminCreditWalletController::class, 'show'])->name('admin.credit-wallets.show');
    Route::post('credit-wallets/{agency}/adjustments', [AdminCreditWalletController::class, 'adjust'])->name('admin.credit-wallets.adjust');

    Route::get('boosts', [AdminBoostController::class, 'index'])->name('admin.boosts.index');
    Route::post('boosts/{boost}/cancel', [AdminBoostController::class, 'cancel'])->name('admin.boosts.cancel');
    Route::post('properties/{property}/offered-boost', [AdminBoostController::class, 'offer'])->name('admin.boosts.offer');

    Route::get('boost-stats', [AdminBoostStatsController::class, 'index'])->name('admin.boost-stats.index');
});
