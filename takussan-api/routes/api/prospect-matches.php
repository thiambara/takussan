<?php

use App\Http\Controllers\Api\Crm\ProspectMatchController;
use Illuminate\Support\Facades\Route;

// TCK-591 §5 — rapprochement prospect ↔ bien, borné au personnel de l'agence.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('customers/{customer}/matching-properties', [ProspectMatchController::class, 'forCustomer'])
        ->name('customers.matching-properties');
    Route::get('properties/{property}/matching-customers', [ProspectMatchController::class, 'forProperty'])
        ->name('properties.matching-customers');
});
