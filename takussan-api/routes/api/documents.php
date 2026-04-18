<?php

use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\DocumentShareLinkController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('documents', [DocumentController::class, 'index'])->name('documents.index');
    Route::post('documents', [DocumentController::class, 'store'])->name('documents.store');
    Route::get('documents/{document}', [DocumentController::class, 'show'])->name('documents.show');
    Route::post('documents/{document}/verify', [DocumentController::class, 'verify'])->name('documents.verify');
    Route::delete('documents/{document}', [DocumentController::class, 'destroy'])->name('documents.destroy');

    // Document share links
    Route::post('documents/{document}/share', [DocumentShareLinkController::class, 'store'])->name('document-share-links.store');
    Route::delete('documents/{document}/share/{link}', [DocumentShareLinkController::class, 'destroy'])->name('document-share-links.destroy');
});

// Public share link routes (no auth required)
Route::get('share/{token}', [DocumentShareLinkController::class, 'show'])->name('share.show');
Route::get('share/{token}/download', [DocumentShareLinkController::class, 'download'])->name('share.download');
