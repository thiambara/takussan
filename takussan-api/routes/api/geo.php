<?php

use App\Http\Controllers\Api\Admin\GeoNeighborhoodAdminController;
use App\Http\Controllers\Api\GeoLinkController;
use App\Http\Controllers\Public\GeoReferentialController;
use Illuminate\Support\Facades\Route;

/*
| TCK-633 (ADR-0062) — le référentiel géographique. Fichier propre au lot D : `routes/api/public.php`
| est tenu par un autre lot. Même groupe que les lectures publiques : préfixe `public`, nom
| `public.`, limiteur `public-read`.
*/
Route::prefix('public/geo')->name('public.geo.')->middleware('throttle:public-read')->group(function () {
    // TCK-1207 (P103.03) — listes fermées, sans appelant ni langue dans le corps : cache public de
    // cinq minutes et `ETag`, comme les énumérations (`enums.php`).
    Route::get('regions', [GeoReferentialController::class, 'regions'])->middleware('cache.headers:public;max_age=300;etag')->name('regions');
    Route::get('cities', [GeoReferentialController::class, 'cities'])->middleware('cache.headers:public;max_age=300;etag')->name('cities');
    Route::get('cities/{city}', [GeoReferentialController::class, 'city'])->whereNumber('city')->name('cities.show');
    Route::get('neighborhoods', [GeoReferentialController::class, 'neighborhoods'])->name('neighborhoods');
});

// TCK-633 (addendum du plan maître, interface D → E) — le catalogue approuvé des équipements, lu
// sans compte par les filtres de la recherche publique (`/api/tags` exige un compte).
// TCK-1207 (P103.03) — même cache public que les énumérations.
Route::middleware(['throttle:public-read', 'cache.headers:public;max_age=300;etag'])->get('public/amenities', [GeoReferentialController::class, 'amenities'])->name('public.amenities');

// TCK-633 (AC9) — un lien court collé : requête SORTANTE, d'où le compte exigé et le limiteur serré.
Route::middleware(['auth:sanctum', 'throttle:20,1'])->post('geo/resolve-link', GeoLinkController::class)->name('geo.resolve-link');

// TCK-633 (AC5) — la file des quartiers proposés : super-admin seulement.
Route::middleware(['auth:sanctum', 'super-admin'])->prefix('admin/geo')->name('admin.geo.')->group(function () {
    Route::get('neighborhoods', [GeoNeighborhoodAdminController::class, 'index'])->name('neighborhoods.index');
    Route::post('neighborhoods/{neighborhood}/approve', [GeoNeighborhoodAdminController::class, 'approve'])->name('neighborhoods.approve');
    Route::post('neighborhoods/{neighborhood}/reject', [GeoNeighborhoodAdminController::class, 'reject'])->name('neighborhoods.reject');
    Route::patch('neighborhoods/{neighborhood}', [GeoNeighborhoodAdminController::class, 'rename'])->name('neighborhoods.rename');
    Route::post('neighborhoods/{neighborhood}/merge', [GeoNeighborhoodAdminController::class, 'merge'])->name('neighborhoods.merge');
});
