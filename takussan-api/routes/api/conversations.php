<?php

use App\Http\Controllers\Api\ConversationContextController;
use App\Http\Controllers\Api\ConversationController;
use App\Http\Controllers\Api\ConversationParticipantController;
use App\Http\Controllers\Api\MessagingContactController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('conversations', [ConversationController::class, 'index'])->name('conversations.index');
    Route::post('conversations', [ConversationController::class, 'store'])->name('conversations.store');
    // TCK-565 — littérale, donc AVANT `conversations/{conversation}` : sinon « contacts » serait
    // lu comme un identifiant de conversation (404 par liaison de modèle).
    Route::get('conversations/contacts', [MessagingContactController::class, 'index'])->name('conversations.contacts.index');
    // TCK-576 — le bien et le bail d'un groupe, cherchés par leur nom. Littérales elles aussi : à
    // déclarer avant toute route `conversations/{conversation}/…` de même forme.
    Route::get('conversations/context/properties', [ConversationContextController::class, 'properties'])
        ->name('conversations.context.properties');
    Route::get('conversations/context/leases', [ConversationContextController::class, 'leases'])
        ->name('conversations.context.leases');
    Route::get('conversations/{conversation}', [ConversationController::class, 'show'])->name('conversations.show');
    // TCK-565 — les personnes qu'on peut ajouter à CE groupe (même règle que l'ajout, avec lui).
    Route::get('conversations/{conversation}/contacts', [MessagingContactController::class, 'forConversation'])
        ->name('conversations.contacts.for-conversation');
    // TCK-085 — admin-only rename
    Route::patch('conversations/{conversation}', [ConversationController::class, 'update'])->name('conversations.update');
    // TCK-085 — per-participant mute toggle
    Route::put('conversations/{conversation}/mute', [ConversationController::class, 'toggleMute'])->name('conversations.mute');

    Route::get('conversations/{conversation}/messages', [ConversationController::class, 'messages'])->name('conversations.messages.index');
    Route::post('conversations/{conversation}/messages', [ConversationController::class, 'sendMessage'])->name('conversations.messages.store');
    Route::put('conversations/{conversation}/read', [ConversationController::class, 'markAsRead'])->name('conversations.read');
    Route::put('conversations/{conversation}/archive', [ConversationController::class, 'archive'])->name('conversations.archive');
    Route::put('conversations/{conversation}/unarchive', [ConversationController::class, 'unarchive'])->name('conversations.unarchive');

    // TCK-085 — group participant management
    Route::post('conversations/{conversation}/participants', [ConversationParticipantController::class, 'store'])
        ->name('conversations.participants.store');
    Route::delete('conversations/{conversation}/participants/{user}', [ConversationParticipantController::class, 'destroy'])
        ->name('conversations.participants.destroy');
    Route::patch('conversations/{conversation}/participants/{user}', [ConversationParticipantController::class, 'update'])
        ->name('conversations.participants.update');
});
