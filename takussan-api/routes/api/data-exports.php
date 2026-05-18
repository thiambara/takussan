<?php

use App\Http\Controllers\Api\DataExportDownloadController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('data-exports/{dataExport}/download', DataExportDownloadController::class)
        ->name('data-exports.download');
});
