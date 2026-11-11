<?php

use App\Http\Controllers\Api\Me\MeExportsController;
use Illuminate\Support\Facades\Route;

/*
 * TCK-2627 — « Mes derniers exports » : relus du journal `data_exported`, jamais retéléchargés.
 * Fichier à part de `me.php` pour ne pas croiser une autre voie qui l'édite.
 */
Route::middleware('auth:sanctum')->prefix('me')->group(function () {
    Route::get('exports', [MeExportsController::class, 'index'])->name('me.exports.index');
});
