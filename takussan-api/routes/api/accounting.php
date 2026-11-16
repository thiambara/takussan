<?php

use App\Http\Controllers\Api\Accounting\BankCsvMappingController;
use App\Http\Controllers\Api\Accounting\BankStatementController;
use App\Http\Controllers\Api\Accounting\BankStatementLineController;
use App\Http\Controllers\Api\Accounting\BankStatementPreviewController;
use App\Http\Controllers\Api\Accounting\FinalizeBankStatementController;
use App\Http\Controllers\Api\Accounting\PaymentSearchController;
use App\Http\Controllers\Api\Accounting\ReconciliationIgnoredPaymentController;
use App\Http\Controllers\Api\Accounting\ReconciliationOverviewController;
use App\Http\Controllers\Api\Accounting\SupportedStatementFormatsController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::prefix('agencies/{agency}')->group(function () {
        Route::get('bank-statements', [BankStatementController::class, 'index']);
        Route::post('bank-statements', [BankStatementController::class, 'store']);
        Route::get('bank-statements/payment-search', PaymentSearchController::class);
        // TCK-593 — le mapping CSV de l'agence.
        Route::get('bank-statements/csv-mapping', [BankCsvMappingController::class, 'show']);
        Route::put('bank-statements/csv-mapping', [BankCsvMappingController::class, 'update']);
        // TCK-2674 — le rapprochement vu par paiement : la synthèse du mois, le reste à rapprocher,
        // la recherche d'une ligne à l'échelle de l'agence, la confirmation groupée.
        Route::get('reconciliation/overview', [ReconciliationOverviewController::class, 'overview'])->name('reconciliation.overview');
        Route::get('reconciliation/pending-payments', [ReconciliationOverviewController::class, 'pendingPayments'])->name('reconciliation.pending-payments');
        Route::get('bank-statement-lines', [BankStatementLineController::class, 'search'])->name('bank-statement-lines.search');
        Route::post('bank-statement-lines/confirm-batch', [BankStatementLineController::class, 'confirmBatch'])->name('bank-statement-lines.confirm-batch');
        // TCK-2932 — un paiement sans ligne de banque sorti du reste à rapprocher (et remis), un
        // relevé lu avant l'import sans rien écrire, les formats et banques que l'import sait lire.
        Route::get('reconciliation/ignored-payments', [ReconciliationIgnoredPaymentController::class, 'index'])->name('reconciliation.ignored-payments.index');
        Route::post('reconciliation/ignored-payments', [ReconciliationIgnoredPaymentController::class, 'store'])->name('reconciliation.ignored-payments.store');
        Route::delete('reconciliation/ignored-payments/{ignoredPayment}', [ReconciliationIgnoredPaymentController::class, 'destroy'])->name('reconciliation.ignored-payments.destroy');
        Route::post('bank-statements/preview', BankStatementPreviewController::class)->name('bank-statements.preview');
        Route::get('reconciliation/supported-formats', SupportedStatementFormatsController::class)->name('reconciliation.supported-formats');
    });

    Route::get('bank-statements/{statement}', [BankStatementController::class, 'show']);
    Route::get('bank-statements/{statement}/lines', [BankStatementLineController::class, 'index']);
    Route::post('bank-statements/{statement}/finalize', FinalizeBankStatementController::class);

    Route::post('bank-statement-lines/{line}/match', [BankStatementLineController::class, 'match']);
    Route::delete('bank-statement-lines/{line}/match', [BankStatementLineController::class, 'unmatch']);
    Route::post('bank-statement-lines/{line}/ignore', [BankStatementLineController::class, 'ignore']);
});
