<?php

use App\Http\Controllers\Api\FavoriteController;
use App\Http\Controllers\Api\PropertyController;
use App\Http\Controllers\Api\ReviewController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('properties', [PropertyController::class, 'index'])->name('properties.index');
    Route::post('properties', [PropertyController::class, 'store'])->name('properties.store');
    Route::get('properties/{property}', [PropertyController::class, 'show'])->name('properties.show');
    Route::put('properties/{property}', [PropertyController::class, 'update'])->name('properties.update');
    Route::patch('properties/{property}', [PropertyController::class, 'update']);
    Route::delete('properties/{property}', [PropertyController::class, 'destroy'])->name('properties.destroy');
    Route::post('properties/{property}/publish', [PropertyController::class, 'publish'])->name('properties.publish');

    // Favorites
    Route::get('favorites', [FavoriteController::class, 'index'])->name('favorites.index');
    Route::post('favorites', [FavoriteController::class, 'store'])->name('favorites.store');
    Route::delete('favorites/{property}', [FavoriteController::class, 'destroy'])->name('favorites.destroy');

    // Reviews (nested under property)
    Route::get('properties/{property}/reviews', [ReviewController::class, 'indexForProperty'])->name('properties.reviews.index');
    Route::post('properties/{property}/reviews', [ReviewController::class, 'storeForProperty'])->name('properties.reviews.store');
    Route::post('reviews/{review}/reply', [ReviewController::class, 'reply'])->name('reviews.reply');
    Route::post('reviews/{review}/approve', [ReviewController::class, 'approve'])->name('reviews.approve');
});
