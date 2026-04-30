<?php

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
