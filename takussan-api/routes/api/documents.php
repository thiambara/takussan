<?php

use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\DocumentShareLinkController;
use App\Http\Controllers\Api\DocumentVersionController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('documents', [DocumentController::class, 'index'])->name('documents.index');
    Route::post('documents', [DocumentController::class, 'store'])->name('documents.store');
    Route::get('documents/{document}', [DocumentController::class, 'show'])->name('documents.show');
    Route::post('documents/{document}/verify', [DocumentController::class, 'verify'])->name('documents.verify');
    Route::delete('documents/{document}', [DocumentController::class, 'destroy'])->name('documents.destroy');

    // Document share links
    // TCK-078 — index lists active (non-revoked, non-expired) links for a document
    Route::get('documents/{document}/share-links', [DocumentShareLinkController::class, 'index'])->name('document-share-links.index');
    Route::post('documents/{document}/share', [DocumentShareLinkController::class, 'store'])->name('document-share-links.store');
    Route::delete('documents/{document}/share/{link}', [DocumentShareLinkController::class, 'destroy'])->name('document-share-links.destroy');
    // Document versions — TCK-097
    Route::get('documents/{document}/versions', [DocumentVersionController::class, 'index'])->name('document-versions.index');
    Route::post('documents/{document}/versions', [DocumentVersionController::class, 'store'])->name('document-versions.store');
    Route::get('documents/{document}/versions/{versionId}/download', [DocumentVersionController::class, 'download'])->name('document-versions.download');
    Route::post('documents/{document}/versions/{versionId}/restore', [DocumentVersionController::class, 'restore'])->name('document-versions.restore');
});

// Public share link routes (no auth required)
Route::get('share/{token}', [DocumentShareLinkController::class, 'show'])->name('share.show');
Route::get('share/{token}/download', [DocumentShareLinkController::class, 'download'])->name('share.download');
