<?php

use App\Http\Controllers\Api\Admin\RadarAdvertiserController;
use App\Http\Controllers\Api\Admin\RadarDashboardController;
use App\Http\Controllers\Api\Admin\RadarListingController;
use App\Http\Controllers\Api\Admin\RadarListingMatchController;
use App\Http\Controllers\Api\Admin\RadarListingReviewController;
use App\Http\Controllers\Api\Admin\RadarOutreachController;
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
        Route::post('listings/{listing}/duplicate', [RadarListingReviewController::class, 'duplicate'])->name('admin.radar.listings.duplicate');
        Route::post('listings/{listing}/discard', [RadarListingReviewController::class, 'discard'])->name('admin.radar.listings.discard');
        Route::put('listings/{listing}/advertiser', [RadarListingReviewController::class, 'advertiser'])->name('admin.radar.listings.advertiser');
        Route::get('listings/{listing}/matches', RadarListingMatchController::class)->name('admin.radar.listings.matches');
        // TCK-2388 — le démarchage : les files et la fiche annonceur (lecture libre), la prise en charge de 10 minutes.
        Route::get('advertisers', [RadarAdvertiserController::class, 'index'])->name('admin.radar.advertisers.index');
        Route::get('advertisers/{advertiser}', [RadarAdvertiserController::class, 'show'])->name('admin.radar.advertisers.show');
        Route::post('advertisers/{advertiser}/claim', [RadarAdvertiserController::class, 'claim'])->name('admin.radar.advertisers.claim');
        Route::delete('advertisers/{advertiser}/claim', [RadarAdvertiserController::class, 'release'])->name('admin.radar.advertisers.release');
        // Le message d'accord : préparé (ou relance), retouché, marqué envoyé. Chacun exige la prise en charge.
        Route::post('advertisers/{advertiser}/outreaches', [RadarOutreachController::class, 'store'])->name('admin.radar.advertisers.outreaches.store');
        Route::patch('outreaches/{outreach}', [RadarOutreachController::class, 'update'])->name('admin.radar.outreaches.update');
        Route::post('outreaches/{outreach}/sent', [RadarOutreachController::class, 'sent'])->name('admin.radar.outreaches.sent');
        // La réponse de l'annonceur : des captures (multipart) ; la vérification par l'IA part en file.
        Route::post('outreaches/{outreach}/reply', [RadarOutreachController::class, 'reply'])->name('admin.radar.outreaches.reply');
    });
