<?php

use App\Http\Controllers\Api\PublicSearchAlertController;
use App\Http\Controllers\Api\SavedSearchController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('saved-searches', [SavedSearchController::class, 'index'])->name('saved-searches.index');
    Route::post('saved-searches', [SavedSearchController::class, 'store'])->name('saved-searches.store');
    // TCK-599 — littérale, déclarée AVANT les routes à paramètre.
    Route::post('saved-searches/claim', [SavedSearchController::class, 'claim'])->name('saved-searches.claim');
    // TCK-2507 — la recherche ouverte par son titulaire : le front compte les biens publiés depuis.
    Route::post('saved-searches/{savedSearch}/viewed', [SavedSearchController::class, 'viewed'])->name('saved-searches.viewed');
    Route::put('saved-searches/{savedSearch}', [SavedSearchController::class, 'update'])->name('saved-searches.update');
    Route::patch('saved-searches/{savedSearch}', [SavedSearchController::class, 'update']);
    Route::delete('saved-searches/{savedSearch}', [SavedSearchController::class, 'destroy'])->name('saved-searches.destroy');
});

// TCK-599 (ADR-0050) — hors session : le lien d'un e-mail d'alerte. URL signée RELATIVE (la page
// du front la rejoue vers l'API, d'un autre hôte) ; POST seulement.
Route::post('saved-searches/{savedSearch}/unsubscribe', [SavedSearchController::class, 'unsubscribe'])
    ->middleware(['signed:relative', 'throttle:public-search-alert'])
    ->name('saved-searches.unsubscribe');

// TCK-599 (ADR-0050 §4) — l'alerte sans compte : aucune route ne dit si un contact est connu.
Route::prefix('public/search-alerts')->name('public.search-alerts.')->group(function () {
    Route::get('capabilities', [PublicSearchAlertController::class, 'capabilities'])->name('capabilities');
    Route::middleware('throttle:public-search-alert')->group(function () {
        Route::post('/', [PublicSearchAlertController::class, 'store'])->name('store');
        Route::post('confirm', [PublicSearchAlertController::class, 'confirm'])->name('confirm');
        Route::post('unsubscribe', [PublicSearchAlertController::class, 'unsubscribe'])->name('unsubscribe');
        // TCK-2513 — la page d'un lien lit son alerte (sans rien consommer), et peut l'espacer au lieu de la couper.
        Route::get('by-token', [PublicSearchAlertController::class, 'byToken'])->name('by-token');
        Route::post('frequency', [PublicSearchAlertController::class, 'frequency'])->name('frequency');
    });
});
