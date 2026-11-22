<?php

use App\Http\Controllers\Api\ExportController;
use Illuminate\Support\Facades\Route;

/*
 * TCK-032 P2 — data exports.
 *
 * Separate file from dashboard.php so the mount is additive and
 * the auto-loader in routes/api.php picks it up without edits.
 */
Route::middleware('auth:sanctum')->group(function () {
    Route::get('export/{entity}', [ExportController::class, 'show'])
        ->where('entity', '[a-z_-]+')
        ->name('export.show');
    // TCK-2866 — le nombre de lignes avant l'export : mêmes filtres, même cloisonnement, même droit.
    Route::get('export/{entity}/count', [ExportController::class, 'count'])
        ->where('entity', '[a-z_-]+')
        ->name('export.count');
});
