<?php

use App\Http\Controllers\Api\CommitmentController;
use App\Http\Controllers\Api\CommitmentListController;
use Illuminate\Support\Facades\Route;

/*
 * TCK-2969 (ADR-0130 § 2) — les engagements du fil. Chaque geste passe par la route de l'engagement,
 * jamais par une route de la messagerie (ADR-0128 § 4). Mêmes limiteur et rejeu que l'envoi d'un message
 * pour noter : la carte `commitment.noted` est un message du fil.
 */
Route::middleware('auth:sanctum')->group(function () {
    // TCK-2987 (ADR-0130 § 6) — les engagements du lecteur, hors des fils (l'onglet « Engagements »).
    Route::get('commitments', [CommitmentListController::class, 'index'])->name('commitments.index');
    Route::get('conversations/{conversation}/commitments', [CommitmentController::class, 'index'])
        ->name('conversations.commitments.index');
    Route::post('conversations/{conversation}/commitments', [CommitmentController::class, 'store'])
        ->middleware(['throttle:conversation-message', 'idempotent'])
        ->name('conversations.commitments.store');
    Route::post('commitments/{commitment}/confirm', [CommitmentController::class, 'confirm'])->name('commitments.confirm');
    Route::post('commitments/{commitment}/cancel', [CommitmentController::class, 'cancel'])->name('commitments.cancel');
    // TCK-2970 (ADR-0130 §§ 3 et 4) — reporter, déclarer tenu, rouvrir, « Pas encore », relancer à la main.
    Route::put('commitments/{commitment}', [CommitmentController::class, 'update'])->name('commitments.update');
    Route::post('commitments/{commitment}/kept', [CommitmentController::class, 'kept'])->name('commitments.kept');
    Route::post('commitments/{commitment}/reopen', [CommitmentController::class, 'reopen'])->name('commitments.reopen');
    Route::post('commitments/{commitment}/not-yet', [CommitmentController::class, 'notYet'])->name('commitments.not-yet');
    Route::post('commitments/{commitment}/remind', [CommitmentController::class, 'remind'])->name('commitments.remind');
});
