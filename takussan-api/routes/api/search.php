<?php

use App\Http\Controllers\Api\SearchDocumentController;
use App\Http\Controllers\Api\SearchMessageController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('search/messages', [SearchMessageController::class, 'index'])->name('search.messages');
    Route::get('search/documents', [SearchDocumentController::class, 'index'])->name('search.documents');
});
