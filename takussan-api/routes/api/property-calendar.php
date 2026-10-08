<?php

use App\Http\Controllers\Api\PropertyCalendarFeedController;
use App\Http\Controllers\Api\PropertyIcalTokenController;
use App\Http\Controllers\Api\PropertyUnavailabilityController;
use Illuminate\Support\Facades\Route;

// TCK-596 §3B (ADR-0041) — le calendrier d'hôte d'un bien : dates bloquées, flux importés, jeton
// d'export. L'autorisation est celle de `PropertyPolicy::update`.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('properties/{property}/unavailabilities', [PropertyUnavailabilityController::class, 'index'])
        ->name('properties.unavailabilities.index');
    Route::post('properties/{property}/unavailabilities', [PropertyUnavailabilityController::class, 'store'])
        ->name('properties.unavailabilities.store');
    Route::delete('property-unavailabilities/{unavailability}', [PropertyUnavailabilityController::class, 'destroy'])
        ->whereNumber('unavailability')
        ->name('property-unavailabilities.destroy');

    Route::get('properties/{property}/calendar-feeds', [PropertyCalendarFeedController::class, 'index'])
        ->name('properties.calendar-feeds.index');
    Route::post('properties/{property}/calendar-feeds', [PropertyCalendarFeedController::class, 'store'])
        ->middleware('throttle:calendar-feed-create')
        ->name('properties.calendar-feeds.store');
    Route::post('property-calendar-feeds/{feed}/sync', [PropertyCalendarFeedController::class, 'sync'])
        ->whereNumber('feed')
        ->name('property-calendar-feeds.sync');
    Route::delete('property-calendar-feeds/{feed}', [PropertyCalendarFeedController::class, 'destroy'])
        ->whereNumber('feed')
        ->name('property-calendar-feeds.destroy');

    Route::post('properties/{property}/ical-token', [PropertyIcalTokenController::class, 'store'])
        ->name('properties.ical-token.store');
});
