<?php

use App\Http\Controllers\Api\ConversationCardController;
use App\Http\Controllers\Api\ConversationContextController;
use App\Http\Controllers\Api\ConversationController;
use App\Http\Controllers\Api\ConversationCopiloteController;
use App\Http\Controllers\Api\ConversationParticipantController;
use App\Http\Controllers\Api\ConversationPilotageController;
use App\Http\Controllers\Api\ConversationReportController;
use App\Http\Controllers\Api\ConversationRoomController;
use App\Http\Controllers\Api\CopiloteSuggestionController;
use App\Http\Controllers\Api\MessageTranscriptionController;
use App\Http\Controllers\Api\MessagingContactController;
use App\Http\Controllers\Api\PontInvitationController;
use App\Services\Messaging\Copilote\SortesDuCopilote;
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
    // TCK-2974 (ADR-0131 § 3) — le copilote du fil : l'état du lecteur par sorte, et une demande (`202`, job de
    // la file `ai`). Troisième segment `copilote` : aucune littérale `conversations/…/…` ne la masque. `{sorte}`
    // est la liste fermée de `SortesDuCopilote`.
    // TCK-2981 (ADR-0132 § 3) — « Joindre par WhatsApp » : l'invitation (ou le joint d'emblée). Troisième segment
    // littéral `pont` ; aucune route « relayer ».
    Route::post('conversations/{conversation}/pont/invitations', [PontInvitationController::class, 'store'])
        ->middleware('throttle:pont-invitation')
        ->name('conversations.pont.invitations.store');
    Route::get('conversations/{conversation}/copilote', [ConversationCopiloteController::class, 'etat'])
        ->name('conversations.copilote.show');
    Route::post('conversations/{conversation}/copilote/{sorte}', [ConversationCopiloteController::class, 'demander'])
        ->whereIn('sorte', SortesDuCopilote::sortes())
        ->middleware('throttle:conversation-message')
        ->name('conversations.copilote.store');
    // TCK-2975 (ADR-0131 § 3) — la décision du DEMANDEUR sur une proposition du copilote (sinon 404 ; purgée : 410).
    Route::put('copilote/suggestions/{suggestion}/decision', [CopiloteSuggestionController::class, 'decider'])
        ->where('suggestion', '[0-9]{1,18}') // un bigint, jamais au-delà (IdentifiantsDeRouteHorsBigintTest)
        ->name('copilote.suggestions.decision');
    // TCK-2976 (ADR-0131 § 7) — la transcription d'une note vocale (personnel servi par le copilote ; sinon 404).
    Route::post('conversations/{conversation}/messages/{message}/transcription', [MessageTranscriptionController::class, 'store'])
        ->where('message', '[0-9]{1,18}') // TCK-2976 — un bigint, jamais au-delà
        ->middleware('throttle:conversation-message')
        ->name('conversations.messages.transcription.store');
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
    // TCK-2967 (ADR-0128 § 7) — la boîte de pilotage : « Rappelez-le-moi », « Traité », confier le fil.
    Route::put('conversations/{conversation}/snooze', [ConversationPilotageController::class, 'snooze'])->name('conversations.snooze');
    Route::delete('conversations/{conversation}/snooze', [ConversationPilotageController::class, 'unsnooze'])->name('conversations.unsnooze');
    Route::put('conversations/{conversation}/handled', [ConversationPilotageController::class, 'handle'])->name('conversations.handled');
    Route::delete('conversations/{conversation}/handled', [ConversationPilotageController::class, 'unhandle'])->name('conversations.unhandled');
    Route::put('conversations/{conversation}/assignee', [ConversationPilotageController::class, 'assign'])->name('conversations.assignee');
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
