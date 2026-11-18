<?php

use App\Http\Controllers\Api\ConversationCardController;
use App\Http\Controllers\Api\ConversationContextController;
use App\Http\Controllers\Api\ConversationController;
use App\Http\Controllers\Api\ConversationParticipantController;
use App\Http\Controllers\Api\ConversationReportController;
use App\Http\Controllers\Api\ConversationRoomController;
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
    // TCK-2960 (ADR-0128 § 2) — ouvrir la salle d'un bail ou d'une réservation. Littérale : AVANT
    // `conversations/{conversation}` (aucune route POST de deux segments ne la masque aujourd'hui, mais
    // l'ordre des littérales est la règle du fichier).
    Route::post('conversations/rooms', [ConversationRoomController::class, 'store'])->name('conversations.rooms.store');
    Route::get('conversations/{conversation}', [ConversationController::class, 'show'])->name('conversations.show');
    // TCK-2630 — la colonne de contexte d'un fil : bien, bail, intervention, fiche CRM (personnel).
    // Trois segments comme les littérales `conversations/context/…` de TCK-576, mais le troisième
    // est `context` : aucune ne la masque, et elle n'en masque aucune.
    Route::get('conversations/{conversation}/context', [ConversationController::class, 'context'])
        ->name('conversations.context.show');
    // TCK-565 — les personnes qu'on peut ajouter à CE groupe (même règle que l'ajout, avec lui).
    Route::get('conversations/{conversation}/contacts', [MessagingContactController::class, 'forConversation'])
        ->name('conversations.contacts.for-conversation');
    // TCK-085 — admin-only rename
    Route::patch('conversations/{conversation}', [ConversationController::class, 'update'])->name('conversations.update');
    // TCK-085 — per-participant mute toggle
    Route::put('conversations/{conversation}/mute', [ConversationController::class, 'toggleMute'])->name('conversations.mute');

    Route::get('conversations/{conversation}/messages', [ConversationController::class, 'messages'])->name('conversations.messages.index');
    // TCK-592 — limiteur nommé par utilisateur (verif-592, mineur 9).
    // TCK-1398 (ADR-0072) — `idempotent` après `throttle` : un message rejoué sous la même clé
    // rend le premier au lieu de s'écrire deux fois (texte et note vocale).
    Route::post('conversations/{conversation}/messages', [ConversationController::class, 'sendMessage'])
        ->middleware(['throttle:conversation-message', 'idempotent'])
        ->name('conversations.messages.store');
    // TCK-2964 (ADR-0128 § 4) — poser un objet (un bien, le créneau d'une visite) : `{object: {type, id}}`,
    // le serveur pose le reste. Mêmes limiteur et rejeu que l'envoi d'un message.
    Route::post('conversations/{conversation}/cards', [ConversationCardController::class, 'store'])
        ->middleware(['throttle:conversation-message', 'idempotent'])
        ->name('conversations.cards.store');
    Route::put('conversations/{conversation}/read', [ConversationController::class, 'markAsRead'])->name('conversations.read');
    // TCK-2859 (ADR-0114 § 1) — remettre le fil en non lu pour le lecteur.
    Route::put('conversations/{conversation}/unread', [ConversationController::class, 'markAsUnread'])->name('conversations.unread');
    Route::put('conversations/{conversation}/archive', [ConversationController::class, 'archive'])->name('conversations.archive');
    Route::put('conversations/{conversation}/unarchive', [ConversationController::class, 'unarchive'])->name('conversations.unarchive');

    // TCK-2859 (ADR-0114 § 2) — un participant signale le fil, une fois.
    Route::post('conversations/{conversation}/reports', [ConversationReportController::class, 'store'])
        ->name('conversations.reports.store');

    // TCK-085 — group participant management. TCK-2859 (ADR-0114 § 3) — sur un fil direct, l'ajout
    // crée un groupe neuf et rend ce groupe.
    Route::post('conversations/{conversation}/participants', [ConversationParticipantController::class, 'store'])
        ->name('conversations.participants.store');
    Route::delete('conversations/{conversation}/participants/{user}', [ConversationParticipantController::class, 'destroy'])
        ->name('conversations.participants.destroy');
    Route::patch('conversations/{conversation}/participants/{user}', [ConversationParticipantController::class, 'update'])
        ->name('conversations.participants.update');
});
