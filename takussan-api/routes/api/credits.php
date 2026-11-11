<?php

use App\Http\Controllers\Api\Credits\BoostProductController;
use App\Http\Controllers\Api\Credits\CreditBoostController;
use App\Http\Controllers\Api\Credits\CreditController;
use App\Http\Controllers\Api\Credits\PropertyBoostController;
use Illuminate\Support\Facades\Route;

// TCK-633 lot F (ADR-0061) — le portefeuille de l'espace et la mise en avant d'un bien.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('credits', [CreditController::class, 'show'])->name('credits.show');
    // TCK-642 — le seul solde, pour la pastille des barres de navigation.
    Route::get('credits/balance', [CreditController::class, 'balance'])->name('credits.balance');
    // TCK-2663 — les mises en avant de l'espace et ce qu'elles ont rapporté ; les biens à pousser.
    Route::get('credits/boosts', [CreditBoostController::class, 'index'])->name('credits.boosts.index');
    Route::get('credits/suggestions', [CreditBoostController::class, 'suggestions'])->name('credits.suggestions');
    Route::get('boost-products', [BoostProductController::class, 'index'])->name('boost-products.index');
    Route::get('properties/{property}/boosts', [PropertyBoostController::class, 'index'])->name('properties.boosts.index');
    Route::post('properties/{property}/boosts', [PropertyBoostController::class, 'store'])->name('properties.boosts.store');
});
