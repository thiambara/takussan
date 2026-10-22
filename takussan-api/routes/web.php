<?php

use App\Http\Controllers\NotificationUnsubscribeController;
use App\Http\Controllers\Public\IcalExportController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// TCK-103 — le lien des résumés déjà envoyés (signé sans échéance, sans session). P97.06 (TCK-1243) :
// il n'écrit plus rien et mène à la page du front qui confirme ; le désabonnement est un `POST`
// (`notifications.digest.unsubscribe`, routes/api/notifications.php).
Route::get('notifications/unsubscribe/{user}', NotificationUnsubscribeController::class)
    ->name('notifications.unsubscribe')
    ->middleware('signed:relative');

// TCK-596 §3B (ADR-0041 §3-§4) — le flux iCal d'un bien, lu par une autre plateforme. Le jeton EST
// l'autorisation : aucune session, aucun cookie (une plateforme tierce n'en a pas l'usage, et un
// cookie de session posé ici ne servirait qu'à remplir le stockage) : le groupe `web` est retiré entier.
Route::get('ical/{token}.ics', IcalExportController::class)
    ->where('token', '[0-9a-f]{64}')
    ->withoutMiddleware('web')
    ->middleware('throttle:ical-export')
    ->name('ical.export');
