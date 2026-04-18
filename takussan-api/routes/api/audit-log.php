<?php

use App\Http\Controllers\Api\AuditLogController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('audit-log', [AuditLogController::class, 'index'])->name('audit-log.index');
});
