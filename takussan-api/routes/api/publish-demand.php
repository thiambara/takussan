<?php

use App\Http\Controllers\Public\PublicPublishDemandController;
use Illuminate\Support\Facades\Route;

/*
| TCK-2603 (ADR-0088, amendement du 2026-11-10, cinquième sortie) — la demande qui donne envie de publier : le total
| des recherches des 7 derniers jours pour une ville, lu sans compte au départ de `/publish`. Fichier propre : même
| groupe que les lectures publiques (préfixe `public`, nom `public.`, limiteur `public-read`). Le chiffre est gardé une
| heure côté serveur.
*/
Route::middleware('throttle:public-read')
    ->get('public/publish/demand', PublicPublishDemandController::class)
    ->name('public.publish.demand');
