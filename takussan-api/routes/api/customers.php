<?php

use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomerNoteController;
use App\Http\Controllers\Api\CustomerTagController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('customers', [CustomerController::class, 'index'])->name('customers.index');
    Route::get('customers/pipeline-stats', [CustomerController::class, 'pipelineStats'])->name('customers.pipeline-stats');
    Route::post('customers', [CustomerController::class, 'store'])->name('customers.store');
    Route::get('customers/{customer}', [CustomerController::class, 'show'])->name('customers.show');
    Route::put('customers/{customer}', [CustomerController::class, 'update'])->name('customers.update');
    Route::patch('customers/{customer}', [CustomerController::class, 'update']);
    Route::delete('customers/{customer}', [CustomerController::class, 'destroy'])->name('customers.destroy');
    Route::post('customers/{customer}/primary-contact', [CustomerController::class, 'setPrimaryContact'])->name('customers.primary-contact');
    Route::patch('customers/{customer}/pipeline-stage', [CustomerController::class, 'updatePipelineStage'])->name('customers.pipeline-stage');

    // Customer notes
    Route::get('customers/{customer}/notes', [CustomerNoteController::class, 'index'])->name('customer-notes.index');
    Route::post('customers/{customer}/notes', [CustomerNoteController::class, 'store'])->name('customer-notes.store');
    Route::delete('customers/{customer}/notes/{note}', [CustomerNoteController::class, 'destroy'])->name('customer-notes.destroy');

    // Customer tags (TCK-093)
    Route::post('customers/{customer}/tags', [CustomerTagController::class, 'store'])->name('customers.tags.store');
    Route::delete('customers/{customer}/tags/{tag}', [CustomerTagController::class, 'destroy'])->name('customers.tags.destroy');
});
