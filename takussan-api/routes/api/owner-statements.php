<?php

use App\Http\Controllers\Api\OwnerStatementController;
use Illuminate\Support\Facades\Route;

// TCK-594 (ADR-0039 §3) — le relevé de gérance (mois) et l'attestation annuelle (année).
Route::middleware('auth:sanctum')->group(function () {
    Route::get('owner-statements', [OwnerStatementController::class, 'index'])->name('owner-statements.index');
    Route::get('owner-statements/pdf', [OwnerStatementController::class, 'pdf'])->name('owner-statements.pdf');
    Route::get('owner-statements/csv', [OwnerStatementController::class, 'csv'])->name('owner-statements.csv');
});
