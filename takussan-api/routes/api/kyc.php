<?php

use App\Http\Controllers\Api\KycDocumentController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('kyc/documents/{media}', KycDocumentController::class)->where('media', '[0-9]{1,18}')->name('kyc.documents.show');
});
