<?php

use App\Http\Controllers\Api\Admin\UserImpersonationController;
use Illuminate\Support\Facades\Route;

/*
| TCK-600 (ADR-0055) — la session d'impersonation EN COURS, lue avec le jeton d'impersonation pour la
| bannière de l'espace applicatif. Hors du groupe `super-admin` : l'appelant est la cible, jamais un
| opérateur. Démarrer et terminer vivent dans `admin.php`, sous le jeton de l'opérateur.
*/
Route::middleware('auth:sanctum')->group(function () {
    Route::get('impersonation/current', [UserImpersonationController::class, 'current'])
        ->name('impersonation.current');
});
