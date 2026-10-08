<?php

use App\Http\Controllers\Api\Agency\AgentAbsenceController;
use Illuminate\Support\Facades\Route;

// TCK-591 (ADR-0035) — les absences du personnel : une délégation qui nomme l'absent et n'accorde rien.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('agencies/{agency}/absences', [AgentAbsenceController::class, 'index'])->name('agencies.absences.index');
    Route::post('agencies/{agency}/absences', [AgentAbsenceController::class, 'store'])->name('agencies.absences.store');
    Route::delete('agencies/{agency}/absences/{delegation}', [AgentAbsenceController::class, 'destroy'])->name('agencies.absences.destroy');
});
