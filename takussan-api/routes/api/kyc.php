<?php

use App\Http\Controllers\Api\KycDocumentController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('kyc/documents/{media}', KycDocumentController::class)->name('kyc.documents.show');
});
