<?php

use App\Http\Controllers\Api\ConversationController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('conversations', [ConversationController::class, 'index'])->name('conversations.index');
    Route::post('conversations', [ConversationController::class, 'store'])->name('conversations.store');
    Route::get('conversations/{conversation}', [ConversationController::class, 'show'])->name('conversations.show');
    Route::get('conversations/{conversation}/messages', [ConversationController::class, 'messages'])->name('conversations.messages.index');
    Route::post('conversations/{conversation}/messages', [ConversationController::class, 'sendMessage'])->name('conversations.messages.store');
    Route::put('conversations/{conversation}/read', [ConversationController::class, 'markAsRead'])->name('conversations.read');
    Route::put('conversations/{conversation}/archive', [ConversationController::class, 'archive'])->name('conversations.archive');
    Route::put('conversations/{conversation}/unarchive', [ConversationController::class, 'unarchive'])->name('conversations.unarchive');
});
