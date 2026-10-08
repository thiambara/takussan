<?php

use App\Http\Controllers\Api\Agency\AgentHandoverController;
use Illuminate\Support\Facades\Route;

// TCK-591 §8 — inventaire et passation du portefeuille d'un membre qui quitte l'agence.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('agencies/{agency}/members/{user}/portfolio', [AgentHandoverController::class, 'show'])->name('agencies.members.portfolio');
    Route::post('agencies/{agency}/members/{user}/handover', [AgentHandoverController::class, 'store'])->name('agencies.members.handover');
});
