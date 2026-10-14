<?php

use App\Http\Controllers\Api\Admin\TagModerationAdminController;
use App\Http\Controllers\Api\TagController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('tags', [TagController::class, 'index'])->name('tags.index');
    Route::post('tags', [TagController::class, 'store'])->name('tags.store');
    Route::get('tags/{tag}', [TagController::class, 'show'])->name('tags.show');
    Route::put('tags/{tag}', [TagController::class, 'update'])->name('tags.update');
    Route::patch('tags/{tag}', [TagController::class, 'update']);
    Route::delete('tags/{tag}', [TagController::class, 'destroy'])->name('tags.destroy');
});

// TCK-633 (ADR-0062 §7) — la file des équipements proposés : super-admin seulement.
Route::middleware(['auth:sanctum', 'super-admin'])->prefix('admin/tags')->name('admin.tags.')->group(function () {
    Route::get('proposals', [TagModerationAdminController::class, 'proposals'])->name('proposals');
    Route::post('{tag}/approve', [TagModerationAdminController::class, 'approve'])->name('approve');
    Route::post('{tag}/reject', [TagModerationAdminController::class, 'reject'])->name('reject');
    Route::patch('{tag}', [TagModerationAdminController::class, 'rename'])->name('rename');
    Route::post('{tag}/merge', [TagModerationAdminController::class, 'merge'])->name('merge');
});
