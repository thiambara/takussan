<?php

use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomerNoteController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('customers', [CustomerController::class, 'index'])->name('customers.index');
    Route::post('customers', [CustomerController::class, 'store'])->name('customers.store');
    Route::get('customers/{customer}', [CustomerController::class, 'show'])->name('customers.show');
    Route::put('customers/{customer}', [CustomerController::class, 'update'])->name('customers.update');
    Route::patch('customers/{customer}', [CustomerController::class, 'update']);
    Route::delete('customers/{customer}', [CustomerController::class, 'destroy'])->name('customers.destroy');

    // Customer notes
    Route::get('customers/{customer}/notes', [CustomerNoteController::class, 'index'])->name('customer-notes.index');
    Route::post('customers/{customer}/notes', [CustomerNoteController::class, 'store'])->name('customer-notes.store');
    Route::delete('customers/{customer}/notes/{note}', [CustomerNoteController::class, 'destroy'])->name('customer-notes.destroy');
});
