<?php

use App\Http\Controllers\Api\Accounting\BankCsvMappingController;
use App\Http\Controllers\Api\Accounting\BankStatementController;
use App\Http\Controllers\Api\Accounting\BankStatementLineController;
use App\Http\Controllers\Api\Accounting\FinalizeBankStatementController;
use App\Http\Controllers\Api\Accounting\PaymentSearchController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::prefix('agencies/{agency}')->group(function () {
        Route::get('bank-statements', [BankStatementController::class, 'index']);
        Route::post('bank-statements', [BankStatementController::class, 'store']);
        Route::get('bank-statements/payment-search', PaymentSearchController::class);
        // TCK-593 — le mapping CSV de l'agence.
        Route::get('bank-statements/csv-mapping', [BankCsvMappingController::class, 'show']);
        Route::put('bank-statements/csv-mapping', [BankCsvMappingController::class, 'update']);
    });

    Route::get('bank-statements/{statement}', [BankStatementController::class, 'show']);
    Route::get('bank-statements/{statement}/lines', [BankStatementLineController::class, 'index']);
    Route::post('bank-statements/{statement}/finalize', FinalizeBankStatementController::class);

    Route::post('bank-statement-lines/{line}/match', [BankStatementLineController::class, 'match']);
    Route::delete('bank-statement-lines/{line}/match', [BankStatementLineController::class, 'unmatch']);
    Route::post('bank-statement-lines/{line}/ignore', [BankStatementLineController::class, 'ignore']);
});
