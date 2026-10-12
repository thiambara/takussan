<?php

use App\Http\Controllers\Api\Credits\BoostProductController;
use App\Http\Controllers\Api\Credits\CreditController;
use App\Http\Controllers\Api\Credits\PropertyBoostController;
use Illuminate\Support\Facades\Route;

// TCK-633 lot F (ADR-0061) — le portefeuille de l'espace et la mise en avant d'un bien.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('credits', [CreditController::class, 'show'])->name('credits.show');
    Route::get('boost-products', [BoostProductController::class, 'index'])->name('boost-products.index');
    Route::get('properties/{property}/boosts', [PropertyBoostController::class, 'index'])->name('properties.boosts.index');
    Route::post('properties/{property}/boosts', [PropertyBoostController::class, 'store'])->name('properties.boosts.store');
});
