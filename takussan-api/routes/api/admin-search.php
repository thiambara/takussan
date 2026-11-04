<?php

use App\Http\Controllers\Api\Admin\SearchAliasController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Recherche — TCK-2476 (ADR-0088 §7)
|--------------------------------------------------------------------------
| Les variantes d'écriture tenues par l'IA : les lire, les trancher. Aucun `platform-can:` : ces routes restent au
| `super_admin` par le refus par défaut de la console (`PlatformRoutesDefaultDenyTest`), et leurs FormRequest le
| redisent par `platform.settings.manage`.
*/

Route::middleware(['auth:sanctum', 'super-admin'])
    ->prefix('admin/search')
    ->group(function () {
        Route::get('aliases', [SearchAliasController::class, 'index'])->name('admin.search.aliases.index');
        Route::patch('aliases/{alias}', [SearchAliasController::class, 'update'])->name('admin.search.aliases.update');
    });
