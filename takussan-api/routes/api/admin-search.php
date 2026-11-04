<?php

use App\Http\Controllers\Api\Admin\SearchAliasController;
use App\Http\Controllers\Api\Admin\SearchAliasSettingsController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Recherche — TCK-2476 (ADR-0088 §7)
|--------------------------------------------------------------------------
| Les variantes d'écriture tenues par l'IA : les lire, les trancher, et le réglage qui allume leur passage planifié
| (revue adverse du 2026-11-04) — déclaré AVANT `aliases/{alias}`, qui sinon prendrait `settings` pour une variante.
| Aucun `platform-can:` : ces routes restent au `super_admin` par le refus par défaut de la console
| (`PlatformRoutesDefaultDenyTest`), et leurs FormRequest le redisent par `platform.settings.manage`.
*/

Route::middleware(['auth:sanctum', 'super-admin'])
    ->prefix('admin/search')
    ->group(function () {
        Route::get('aliases', [SearchAliasController::class, 'index'])->name('admin.search.aliases.index');
        Route::get('aliases/settings', [SearchAliasSettingsController::class, 'show'])->name('admin.search.aliases.settings.show');
        Route::patch('aliases/settings', [SearchAliasSettingsController::class, 'update'])->name('admin.search.aliases.settings.update');
        Route::patch('aliases/{alias}', [SearchAliasController::class, 'update'])->name('admin.search.aliases.update');
    });
