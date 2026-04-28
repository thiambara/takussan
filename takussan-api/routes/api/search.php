<?php

use App\Http\Controllers\Api\Search\SuggestController;
use App\Http\Controllers\Api\SearchDocumentController;
use App\Http\Controllers\Api\SearchMessageController;
use Illuminate\Support\Facades\Route;

Route::get('search/suggest', SuggestController::class)
    ->middleware('throttle:60,1')
    ->name('search.suggest');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('search/messages', [SearchMessageController::class, 'index'])->name('search.messages');
    Route::get('search/documents', [SearchDocumentController::class, 'index'])->name('search.documents');
});
