<?php

use App\Http\Controllers\Api\Admin\RadarAdvertiserAccountController;
use App\Http\Controllers\Api\Admin\RadarAdvertiserController;
use App\Http\Controllers\Api\Admin\RadarCrawlController;
use App\Http\Controllers\Api\Admin\RadarDashboardController;
use App\Http\Controllers\Api\Admin\RadarListingController;
use App\Http\Controllers\Api\Admin\RadarListingMatchController;
use App\Http\Controllers\Api\Admin\RadarListingPhotoController;
use App\Http\Controllers\Api\Admin\RadarListingReviewController;
use App\Http\Controllers\Api\Admin\RadarOutreachController;
use App\Http\Controllers\Api\Admin\RadarPublicationController;
use App\Http\Controllers\Api\Admin\RadarRevocationController;
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
        // TCK-2389 — la réserve de photos d'une annonce `consented` : relancer la lecture, déposer, retirer.
        Route::post('listings/{listing}/photos/fetch', [RadarListingPhotoController::class, 'fetch'])->name('admin.radar.listings.photos.fetch');
        Route::post('listings/{listing}/photos', [RadarListingPhotoController::class, 'store'])->name('admin.radar.listings.photos.store');
        Route::delete('listings/{listing}/photos/{media}', [RadarListingPhotoController::class, 'destroy'])->name('admin.radar.listings.photos.destroy');
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
        // L'issue : le seul geste qui confirme une réponse (accord), ou qui clôt l'échange (refus, STOP).
        Route::post('outreaches/{outreach}/outcome', [RadarOutreachController::class, 'outcome'])->name('admin.radar.outreaches.outcome');
        // TCK-2395 (ADR-0077 §5) — envoyer le message préparé par l'API, depuis le numéro WhatsApp dédié au Radar.
        Route::post('outreaches/{outreach}/send', [RadarOutreachController::class, 'send'])->name('admin.radar.outreaches.send');
    });

/*
| TCK-2389 (ADR-0077 §6, §11) — publier pour l'annonceur : `platform.radar.publish`, `super_admin` seul. Le `support`
| prépare (groupe ci-dessus), il ne publie pas : l'aperçu et le message sont aussi réservés, ils portent le compte à créer.
*/
Route::middleware(['auth:sanctum', 'super-admin', 'platform-can:'.PlatformAbility::RadarPublish->value])
    ->prefix('admin/radar')
    ->group(function () {
        Route::get('advertisers/{advertiser}/publication-preview', [RadarPublicationController::class, 'preview'])->name('admin.radar.advertisers.publication-preview');
        Route::post('advertisers/{advertiser}/publish', [RadarPublicationController::class, 'publish'])->middleware('idempotent')->name('admin.radar.advertisers.publish');
        Route::get('advertisers/{advertiser}/published-message', [RadarPublicationController::class, 'publishedMessage'])->name('admin.radar.advertisers.published-message');
    });

/*
| TCK-2391 (ADR-0077 §8) — révoquer un annonceur : ses biens quittent le public et l'index dans la requête, il ne se contacte plus.
| `platform.radar.publish`, `super_admin` seul : retirer du public est le pendant d'y avoir publié.
*/
Route::middleware(['auth:sanctum', 'super-admin', 'platform-can:'.PlatformAbility::RadarPublish->value])
    ->prefix('admin/radar')
    ->group(function () {
        Route::post('advertisers/{advertiser}/revoke', [RadarRevocationController::class, 'revoke'])->name('admin.radar.advertisers.revoke');
    });

/*
| TCK-2392 (ADR-0077 §10) — la collecte automatique. Lire les sites et leurs passages, séparer une fusion automatique :
| `platform.radar.operate`. Allumer un site, régler sa fréquence, lancer un passage : `platform.radar.publish`, `super_admin`
| seul — c'est engager le budget d'IA et la lecture d'un site tiers, un geste du porteur.
*/
Route::middleware(['auth:sanctum', 'super-admin', 'platform-can:'.PlatformAbility::RadarOperate->value])
    ->prefix('admin/radar')
    ->group(function () {
        Route::get('crawl/sources', [RadarCrawlController::class, 'sources'])->name('admin.radar.crawl.sources.index');
        Route::get('crawl/runs', [RadarCrawlController::class, 'runs'])->name('admin.radar.crawl.runs.index');
        Route::post('listings/{listing}/unmerge', [RadarListingReviewController::class, 'unmerge'])->name('admin.radar.listings.unmerge');
    });
Route::middleware(['auth:sanctum', 'super-admin', 'platform-can:'.PlatformAbility::RadarPublish->value])
    ->prefix('admin/radar')
    ->group(function () {
        Route::patch('crawl/sources/{site}', [RadarCrawlController::class, 'update'])->name('admin.radar.crawl.sources.update');
        Route::post('crawl/sources/{site}/run', [RadarCrawlController::class, 'run'])->name('admin.radar.crawl.sources.run');
    });

/*
| TCK-2413 (ADR-0077 §3, §11) — délier l'annonceur du compte supprimé que le Radar avait créé : la réclamation reprend.
| `platform.radar.publish`, `super_admin` seul : le compte délié est celui que « Publier pour lui » avait créé. Refusé sur un
| annonceur révoqué (STOP, accord retiré, numéro purgé).
*/
Route::middleware(['auth:sanctum', 'super-admin', 'platform-can:'.PlatformAbility::RadarPublish->value])
    ->prefix('admin/radar')
    ->group(function () {
        Route::post('advertisers/{advertiser}/release-account', [RadarAdvertiserAccountController::class, 'release'])->name('admin.radar.advertisers.release-account');
    });
