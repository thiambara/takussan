<?php

use App\Http\Controllers\Api\CalendarFeedController;
use Illuminate\Support\Facades\Route;

// TCK-591 (ADR-0034) — l'abonnement d'agenda.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('me/calendar-feed', [CalendarFeedController::class, 'current'])->name('calendar-feed.current');
    Route::post('me/calendar-feed', [CalendarFeedController::class, 'store'])->name('calendar-feed.store');
    Route::delete('me/calendar-feed', [CalendarFeedController::class, 'destroy'])->name('calendar-feed.destroy');
});

// Public : le secret est dans l'URL (une application d'agenda ne porte ni cookie ni en-tête).
Route::get('calendar-feed/{token}.ics', [CalendarFeedController::class, 'show'])
    ->where('token', '[A-Za-z0-9]{40}')
    ->middleware('throttle:calendar-feed')
    ->name('calendar-feed.show');
