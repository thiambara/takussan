<?php

use App\Http\Controllers\Api\Me\MeExportsController;
use Illuminate\Support\Facades\Route;

/*
 * TCK-2627 — « Mes derniers exports » : relus du journal `data_exported` ; TCK-2866 — et retéléchargés
 * tant que leur fichier est gardé (ADR-0115).
 * Fichier à part de `me.php` pour ne pas croiser une autre voie qui l'édite.
 */
Route::middleware('auth:sanctum')->prefix('me')->group(function () {
    Route::get('exports', [MeExportsController::class, 'index'])->name('me.exports.index');
    // TCK-2866 (ADR-0115) — le fichier gardé d'un export, à son seul auteur, jusqu'à son échéance.
    Route::get('exports/{id}/download', [MeExportsController::class, 'download'])
        ->where('id', '[0-9]{1,18}')
        ->name('me.exports.download');
});
