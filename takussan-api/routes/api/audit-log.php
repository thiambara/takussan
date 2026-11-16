<?php

use App\Http\Controllers\Api\ActivityLogExportController;
use App\Http\Controllers\Api\AuditLogController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    // Legacy route kept for back-compat with existing clients/tests.
    Route::get('audit-log', [AuditLogController::class, 'index'])->name('audit-log.index');
    Route::get('audit-log/{entity}/{id}', [AuditLogController::class, 'indexByEntity'])->where('id', '[0-9]{1,18}')->name('audit-log.by-entity');

    // Canonical route per TCK-018 spec — same controller action, no behavior
    // change. Added as alias rather than rename to preserve back-compat.
    Route::get('activity-log', [AuditLogController::class, 'index'])->name('activity-log.index');
    Route::get('activity-log/{entity}/{id}', [AuditLogController::class, 'indexByEntity'])->where('id', '[0-9]{1,18}')->name('activity-log.by-entity');

    // TCK-104 — audit trail export (agency_admin / super_admin only).
    Route::get('activity-logs/export', [ActivityLogExportController::class, 'export'])
        ->name('activity-logs.export');

    // TCK-613 (ADR-0044 §2) — le fichier asynchrone : lien signé ET session du demandeur. Hors
    // `auth:sanctum`, le lien était un droit au porteur (sonde P4 de verif-601).
    Route::get('activity-logs/export/download', [ActivityLogExportController::class, 'download'])
        ->name('activity-logs.export.download');
});
