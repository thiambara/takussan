<?php

use App\Http\Controllers\Api\Agency\AgentAbsenceController;
use Illuminate\Support\Facades\Route;

// TCK-591 (ADR-0035) — les absences du personnel : une délégation qui nomme l'absent et n'accorde rien.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('agencies/{agency}/absences', [AgentAbsenceController::class, 'index'])->name('agencies.absences.index');
    Route::post('agencies/{agency}/absences', [AgentAbsenceController::class, 'store'])->name('agencies.absences.store');
    // TCK-2666 (ADR-0035, amendement du 2026-11-10) — modifier une absence et sa délégation liée.
    Route::patch('agencies/{agency}/absences/{delegation}', [AgentAbsenceController::class, 'update'])->name('agencies.absences.update');
    Route::delete('agencies/{agency}/absences/{delegation}', [AgentAbsenceController::class, 'destroy'])->name('agencies.absences.destroy');
});
