<?php

use App\Http\Controllers\Api\ActivityLogExportController;
use App\Http\Controllers\Api\AuditLogController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    // Legacy route kept for back-compat with existing clients/tests.
    Route::get('audit-log', [AuditLogController::class, 'index'])->name('audit-log.index');
    Route::get('audit-log/{entity}/{id}', [AuditLogController::class, 'indexByEntity'])->name('audit-log.by-entity');

    // Canonical route per TCK-018 spec — same controller action, no behavior
    // change. Added as alias rather than rename to preserve back-compat.
    Route::get('activity-log', [AuditLogController::class, 'index'])->name('activity-log.index');
    Route::get('activity-log/{entity}/{id}', [AuditLogController::class, 'indexByEntity'])->name('activity-log.by-entity');

    // TCK-104 — audit trail export (agency_admin / super_admin only).
    Route::get('activity-logs/export', [ActivityLogExportController::class, 'export'])
        ->name('activity-logs.export');
});

// Signed temporary URL for async export download — no auth guard, validated by signature.
Route::get('activity-logs/export/download', [ActivityLogExportController::class, 'download'])
    ->name('activity-logs.export.download');
