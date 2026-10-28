<?php

use App\Http\Controllers\Api\Admin\RadarDashboardController;
use App\Http\Controllers\Api\Admin\RadarListingController;
use App\Http\Controllers\Api\Admin\RadarListingMatchController;
use App\Http\Controllers\Api\Admin\RadarListingReviewController;
use App\Models\Enums\PlatformAbility;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Radar — TCK-2386 (ADR-0077)
|--------------------------------------------------------------------------
| Saisir une annonce collectée hors du catalogue, la relire, suivre ce que l'extraction coûte :
| `platform.radar.operate`, du `support` au `super_admin`. Aucun second facteur récent exigé de
| plus que la console : la saisie ne déplace ni argent ni pouvoir.
*/

Route::middleware(['auth:sanctum', 'super-admin', 'platform-can:'.PlatformAbility::RadarOperate->value])
    ->prefix('admin/radar')
    ->group(function () {
        Route::get('dashboard', RadarDashboardController::class)->name('admin.radar.dashboard');
        Route::post('listings', [RadarListingController::class, 'store'])->name('admin.radar.listings.store');
        Route::get('listings', [RadarListingController::class, 'index'])->name('admin.radar.listings.index');
        Route::get('listings/{listing}', [RadarListingController::class, 'show'])->name('admin.radar.listings.show');
        // TCK-2387 — la relecture : corriger, valider, et les rapprochements (calculés à l'ouverture).
        Route::patch('listings/{listing}', [RadarListingReviewController::class, 'update'])->name('admin.radar.listings.update');
        Route::post('listings/{listing}/review', [RadarListingReviewController::class, 'review'])->name('admin.radar.listings.review');
        Route::get('listings/{listing}/matches', RadarListingMatchController::class)->name('admin.radar.listings.matches');
    });
