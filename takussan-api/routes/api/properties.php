<?php

use App\Http\Controllers\Api\FavoriteController;
use App\Http\Controllers\Api\PropertyCollaboratorController;
use App\Http\Controllers\Api\PropertyController;
use App\Http\Controllers\Api\PropertyMediaController;
use App\Http\Controllers\Api\PropertyPriceHistoryController;
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
    Route::post('properties/{property}/unpublish', [PropertyController::class, 'unpublish'])->name('properties.unpublish');
    Route::post('properties/{property}/view', [PropertyController::class, 'recordView'])->name('properties.view');
    Route::get('properties/{property}/children', [PropertyController::class, 'children'])->name('properties.children');

    // Media
    Route::get('properties/{property}/media', [PropertyMediaController::class, 'index'])->name('properties.media.index');
    Route::post('properties/{property}/media', [PropertyMediaController::class, 'store'])->name('properties.media.store');
    Route::delete('properties/{property}/media/{mediaId}', [PropertyMediaController::class, 'destroy'])->name('properties.media.destroy');
    Route::put('properties/{property}/media/reorder', [PropertyMediaController::class, 'reorder'])->name('properties.media.reorder');

    // Collaborators
    Route::get('properties/{property}/collaborators', [PropertyCollaboratorController::class, 'index'])->name('properties.collaborators.index');
    Route::post('properties/{property}/collaborators', [PropertyCollaboratorController::class, 'store'])->name('properties.collaborators.store');
    Route::put('properties/{property}/collaborators/{collaborator}', [PropertyCollaboratorController::class, 'update'])->name('properties.collaborators.update');
    Route::delete('properties/{property}/collaborators/{collaborator}', [PropertyCollaboratorController::class, 'destroy'])->name('properties.collaborators.destroy');

    // Price history
    Route::get('properties/{property}/price-history', [PropertyPriceHistoryController::class, 'index'])->name('properties.price-history.index');

    // Favorites
    Route::get('favorites', [FavoriteController::class, 'index'])->name('favorites.index');
    Route::post('favorites', [FavoriteController::class, 'store'])->name('favorites.store');
    Route::delete('favorites/{property}', [FavoriteController::class, 'destroy'])->name('favorites.destroy');

    // Reviews (nested under property)
    Route::get('properties/{property}/reviews', [ReviewController::class, 'indexForProperty'])->name('properties.reviews.index');
    Route::post('properties/{property}/reviews', [ReviewController::class, 'storeForProperty'])->name('properties.reviews.store');
    Route::post('reviews/{review}/reply', [ReviewController::class, 'reply'])->name('reviews.reply');
    Route::post('reviews/{review}/approve', [ReviewController::class, 'approve'])->name('reviews.approve');
    Route::post('reviews/{review}/reject', [ReviewController::class, 'reject'])->name('reviews.reject');
    Route::post('reviews/{review}/report', [ReviewController::class, 'report'])->name('reviews.report');
});
