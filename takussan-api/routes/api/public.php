<?php

use App\Http\Controllers\Public\PublicAgencyController;
use App\Http\Controllers\Public\PublicAgentController;
use App\Http\Controllers\Public\PublicPropertyController;
use Illuminate\Support\Facades\Route;

Route::prefix('public')->name('public.')->group(function () {
    Route::get('properties', [PublicPropertyController::class, 'index'])
        ->name('properties.index');

    Route::get('properties/search', [PublicPropertyController::class, 'search'])
        ->name('properties.search');

    Route::get('properties/compare', [PublicPropertyController::class, 'compare'])
        ->middleware('throttle:30,1')
        ->name('properties.compare');

    Route::get('properties/by-ids', [PublicPropertyController::class, 'byIds'])
        ->middleware('throttle:60,1')
        ->name('properties.by-ids');

    Route::get('properties/map', [PublicPropertyController::class, 'map'])
        ->middleware('throttle:60,1')
        ->name('properties.map');

    Route::get('properties/{slug}', [PublicPropertyController::class, 'show'])
        ->name('properties.show');

    Route::get('properties/{slug}/contact', [PublicPropertyController::class, 'contact'])
        ->name('properties.contact');

    Route::get('properties/{slug}/similar', [PublicPropertyController::class, 'similar'])
        ->name('properties.similar');

    Route::get('properties/{slug}/reviews', [PublicPropertyController::class, 'reviews'])
        ->name('properties.reviews');

    // TCK-180 — gate the property review form. Anonymous = always false.
    Route::get('properties/{slug}/review-eligibility', [PublicPropertyController::class, 'reviewEligibility'])
        ->name('properties.review-eligibility');

    Route::post('properties/{slug}/report', [PublicPropertyController::class, 'report'])
        ->middleware('throttle:public-report')
        ->name('properties.report');

    Route::post('properties/{slug}/visit-request', [PublicPropertyController::class, 'visitRequest'])
        ->middleware('throttle:public-visit-request')
        ->name('properties.visit-request');

    Route::post('properties/{slug}/contact-lead', [PublicPropertyController::class, 'contactLead'])
        ->middleware('throttle:public-contact-lead')
        ->name('properties.contact-lead');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('properties/{slug}/booking-request', [PublicPropertyController::class, 'bookingRequest'])
            ->name('properties.booking-request');

        Route::post('properties/{slug}/contact-message', [PublicPropertyController::class, 'contactMessage'])
            ->name('properties.contact-message');
    });

    // TCK-177 — public agent / agency profile pages.
    Route::get('agents/{slug}', [PublicAgentController::class, 'show'])
        ->name('agents.show');

    Route::get('agents/{slug}/properties', [PublicAgentController::class, 'properties'])
        ->name('agents.properties');

    Route::get('agencies/{slug}', [PublicAgencyController::class, 'show'])
        ->name('agencies.show');

    Route::get('agencies/{slug}/properties', [PublicAgencyController::class, 'properties'])
        ->name('agencies.properties');
});
