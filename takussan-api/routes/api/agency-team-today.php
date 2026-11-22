<?php

use App\Http\Controllers\Api\Agency\TeamTodayController;
use Illuminate\Support\Facades\Route;

// TCK-2623 (ADR-0096) — « Équipe aujourd'hui » de l'accueil de l'admin : la même porte que
// `team-performance` (`reports.view_agency`, agence `standard`). Un fichier à part pour ne pas
// mêler ce changement à ceux d'`agencies.php`.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('agencies/{agency}/team-today', [TeamTodayController::class, 'show'])->name('agencies.team-today');
});
